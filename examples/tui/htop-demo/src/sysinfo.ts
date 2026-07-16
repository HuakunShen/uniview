/**
 * System-info core for the monitor. The sampling functions do real I/O (read
 * `os` counters, shell out to `ps`) — which is exactly what a Node/Bun plugin is
 * for; a sandboxed Worker couldn't. The *parsing* and *math* are split out as
 * pure functions (`computeCpuPercent`, `parseEtime`, `parsePs`, `sortProcesses`)
 * so they unit-test without touching the machine.
 */
import { execFileSync } from "node:child_process";
import { cpus, freemem, loadavg, totalmem, type CpuInfo } from "node:os";

export interface Process {
  pid: number;
  cpu: number; // %CPU
  mem: number; // %MEM
  seconds: number; // elapsed seconds (parsed from etime, for sorting)
  etime: string; // elapsed time as displayed
  state: string; // process state code
  command: string; // executable (comm)
}

export type SortKey = "pid" | "cpu" | "mem" | "time" | "command" | "state";
export type SortDir = "asc" | "desc";

/**
 * Busy CPU percentage between two `os.cpus()` snapshots: `1 − Δidle/Δtotal`
 * summed across cores. Needs two samples (a rate), so the caller keeps the
 * previous snapshot. Returns 0 for a zero/negative interval.
 */
export function computeCpuPercent(prev: readonly CpuInfo[], cur: readonly CpuInfo[]): number {
  let idle = 0;
  let total = 0;
  const n = Math.min(prev.length, cur.length);
  for (let i = 0; i < n; i += 1) {
    const p = prev[i]!.times;
    const c = cur[i]!.times;
    const pt = p.user + p.nice + p.sys + p.idle + p.irq;
    const ct = c.user + c.nice + c.sys + c.idle + c.irq;
    idle += c.idle - p.idle;
    total += ct - pt;
  }
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idle / total) * 100));
}

/** Per-core busy percentage between two snapshots (one entry per core). */
export function computeCorePercents(prev: readonly CpuInfo[], cur: readonly CpuInfo[]): number[] {
  const n = Math.min(prev.length, cur.length);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = prev[i]!.times;
    const c = cur[i]!.times;
    const pt = p.user + p.nice + p.sys + p.idle + p.irq;
    const ct = c.user + c.nice + c.sys + c.idle + c.irq;
    const idle = c.idle - p.idle;
    const total = ct - pt;
    out.push(total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0);
  }
  return out;
}

/** Used-memory percentage from the OS free/total counters. */
export function memoryPercent(): number {
  const total = totalmem();
  return total > 0 ? (1 - freemem() / total) * 100 : 0;
}

/** Parse a `ps` etime (`[[DD-]HH:]MM:SS`) into whole seconds. */
export function parseEtime(etime: string): number {
  const dash = etime.indexOf("-");
  const days = dash >= 0 ? Number(etime.slice(0, dash)) : 0;
  const clock = dash >= 0 ? etime.slice(dash + 1) : etime;
  const parts = clock.split(":").map(Number);
  let sec = 0;
  if (parts.length === 3) sec = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  else if (parts.length === 2) sec = parts[0]! * 60 + parts[1]!;
  else sec = parts[0] ?? 0;
  return (Number.isFinite(days) ? days : 0) * 86400 + (Number.isFinite(sec) ? sec : 0);
}

/**
 * Parse the output of `ps -axo pid=,pcpu=,pmem=,etime=,state=,comm=`. `comm`
 * comes last so a path with spaces is captured whole by taking every remaining
 * field. Malformed lines are skipped.
 */
export function parsePs(text: string): Process[] {
  const out: Process[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const f = line.split(/\s+/);
    if (f.length < 6) continue;
    const pid = Number(f[0]);
    if (!Number.isFinite(pid)) continue;
    out.push({
      pid,
      cpu: Number(f[1]) || 0,
      mem: Number(f[2]) || 0,
      etime: f[3]!,
      seconds: parseEtime(f[3]!),
      state: f[4]!,
      command: f.slice(5).join(" "),
    });
  }
  return out;
}

/** Sort by a column; numeric columns compare numerically, text lexically. */
export function sortProcesses(list: readonly Process[], key: SortKey, dir: SortDir): Process[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: Process, b: Process): number => {
    switch (key) {
      case "pid":
        return (a.pid - b.pid) * sign;
      case "cpu":
        return (a.cpu - b.cpu) * sign;
      case "mem":
        return (a.mem - b.mem) * sign;
      case "time":
        return (a.seconds - b.seconds) * sign;
      case "command":
        return a.command.localeCompare(b.command) * sign;
      case "state":
        return a.state.localeCompare(b.state) * sign;
    }
  };
  return list.slice().sort(cmp);
}

/** The last path segment of a command, for a compact table cell. */
export function commandName(command: string): string {
  const slash = command.lastIndexOf("/");
  return slash >= 0 ? command.slice(slash + 1) : command;
}

/** Read the current process table via `ps`; `[]` if `ps` is unavailable. */
export function sampleProcesses(): Process[] {
  try {
    const out = execFileSync("ps", ["-axo", "pid=,pcpu=,pmem=,etime=,state=,comm="], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    return parsePs(out);
  } catch {
    return [];
  }
}

export interface Snapshot {
  cpu: number; // overall busy %
  cores: number[]; // per-core busy %
  mem: number; // used memory %
  memUsedGB: number;
  memTotalGB: number;
  load1: number;
  processes: Process[];
}

const GIB = 1024 ** 3;

/**
 * A sampler closure: each `sample()` reads live counters and returns a snapshot,
 * carrying the previous cpu times forward so CPU% is a true rate.
 */
export function createSampler(): { sample: () => Snapshot } {
  let prevCpus = cpus();
  return {
    sample(): Snapshot {
      const curCpus = cpus();
      const cpu = computeCpuPercent(prevCpus, curCpus);
      const cores = computeCorePercents(prevCpus, curCpus);
      prevCpus = curCpus;
      const procs = sampleProcesses();
      const total = totalmem();
      const free = freemem();
      return {
        cpu,
        cores,
        mem: total > 0 ? (1 - free / total) * 100 : 0,
        memUsedGB: (total - free) / GIB,
        memTotalGB: total / GIB,
        load1: loadavg()[0] ?? 0,
        processes: procs.length > 0 ? procs : syntheticProcesses(),
      };
    },
  };
}

/**
 * A deterministic fallback table for platforms without `ps` (or a locked-down
 * sandbox), so the demo always renders something to sort.
 */
export function syntheticProcesses(): Process[] {
  const names = ["node", "kernel_task", "WindowServer", "Terminal", "launchd", "mds_stores", "coreaudiod", "loginwindow"];
  return names.map((command, i) => {
    const seconds = 30 + i * 137;
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return {
      pid: 100 + i * 7,
      cpu: Math.round((40 / (i + 1)) * 10) / 10,
      mem: Math.round((12 / (i + 1)) * 10) / 10,
      seconds,
      etime: `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`,
      state: i === 0 ? "R" : "S",
      command,
    };
  });
}
