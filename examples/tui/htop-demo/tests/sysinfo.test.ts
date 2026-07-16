import { describe, expect, it } from "vitest";
import type { CpuInfo } from "node:os";
import {
  commandName,
  computeCorePercents,
  computeCpuPercent,
  parseEtime,
  parsePs,
  sortProcesses,
  syntheticProcesses,
  type Process,
} from "../src/sysinfo";

/** Build a one-core cpus() snapshot with the given cumulative times. */
function core(user: number, sys: number, idle: number): CpuInfo {
  return { model: "test", speed: 1, times: { user, nice: 0, sys, idle, irq: 0 } };
}

describe("computeCpuPercent", () => {
  it("is the busy fraction of the delta between snapshots", () => {
    // 10 ticks elapsed, 3 idle → 70% busy.
    const prev = [core(0, 0, 0)];
    const cur = [core(5, 2, 3)];
    expect(computeCpuPercent(prev, cur)).toBeCloseTo(70, 6);
  });

  it("returns 0 for a fully idle interval", () => {
    expect(computeCpuPercent([core(0, 0, 0)], [core(0, 0, 10)])).toBe(0);
  });

  it("returns 0 for a zero-length interval", () => {
    expect(computeCpuPercent([core(1, 1, 1)], [core(1, 1, 1)])).toBe(0);
  });

  it("averages across cores", () => {
    const prev = [core(0, 0, 0), core(0, 0, 0)];
    const cur = [core(10, 0, 0), core(0, 0, 10)]; // one core 100% busy, one 100% idle
    expect(computeCpuPercent(prev, cur)).toBeCloseTo(50, 6);
  });
});

describe("computeCorePercents", () => {
  it("returns one busy percentage per core", () => {
    const prev = [core(0, 0, 0), core(0, 0, 0)];
    const cur = [core(10, 0, 0), core(0, 0, 10)]; // core 0 fully busy, core 1 fully idle
    expect(computeCorePercents(prev, cur)).toEqual([100, 0]);
  });

  it("handles a partial-busy core", () => {
    const [pct] = computeCorePercents([core(0, 0, 0)], [core(2, 0, 8)]);
    expect(pct).toBeCloseTo(20, 6);
  });
});

describe("parseEtime", () => {
  it("parses MM:SS", () => {
    expect(parseEtime("02:05")).toBe(125);
  });
  it("parses HH:MM:SS", () => {
    expect(parseEtime("01:00:00")).toBe(3600);
  });
  it("parses DD-HH:MM:SS", () => {
    expect(parseEtime("2-03:00:00")).toBe(2 * 86400 + 3 * 3600);
  });
});

describe("parsePs", () => {
  const sample = [
    "    1   0.0  0.1 11:14:57 Ss   /sbin/launchd",
    "  543   9.8  1.2 03:26 R    /usr/libexec/logd",
    "  900   0.0  0.0 01-02:00:00 S  /Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper",
    "garbage line",
  ].join("\n");

  it("parses fields and keeps a spaced command whole", () => {
    const procs = parsePs(sample);
    expect(procs).toHaveLength(3); // the garbage line is skipped
    expect(procs[0]).toMatchObject({ pid: 1, cpu: 0, mem: 0.1, state: "Ss", command: "/sbin/launchd" });
    expect(procs[2]!.command).toContain("Google Chrome Helper");
    expect(procs[2]!.seconds).toBe(1 * 86400 + 2 * 3600);
  });
});

describe("sortProcesses", () => {
  const rows: Process[] = [
    { pid: 3, cpu: 5, mem: 1, seconds: 10, etime: "0:10", state: "S", command: "bravo" },
    { pid: 1, cpu: 90, mem: 3, seconds: 200, etime: "3:20", state: "R", command: "alpha" },
    { pid: 2, cpu: 40, mem: 2, seconds: 50, etime: "0:50", state: "S", command: "charlie" },
  ];

  it("sorts cpu descending", () => {
    expect(sortProcesses(rows, "cpu", "desc").map((p) => p.cpu)).toEqual([90, 40, 5]);
  });
  it("sorts pid ascending", () => {
    expect(sortProcesses(rows, "pid", "asc").map((p) => p.pid)).toEqual([1, 2, 3]);
  });
  it("sorts command lexically", () => {
    expect(sortProcesses(rows, "command", "asc").map((p) => p.command)).toEqual(["alpha", "bravo", "charlie"]);
  });
  it("sorts by elapsed time", () => {
    expect(sortProcesses(rows, "time", "desc").map((p) => p.seconds)).toEqual([200, 50, 10]);
  });
  it("does not mutate the input", () => {
    const before = rows.map((p) => p.pid);
    sortProcesses(rows, "cpu", "desc");
    expect(rows.map((p) => p.pid)).toEqual(before);
  });
});

describe("commandName", () => {
  it("takes the last path segment", () => {
    expect(commandName("/usr/bin/node")).toBe("node");
    expect(commandName("bash")).toBe("bash");
  });
});

describe("syntheticProcesses", () => {
  it("provides a non-empty deterministic fallback", () => {
    const a = syntheticProcesses();
    const b = syntheticProcesses();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});
