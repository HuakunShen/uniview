import { createElement as h, useState, type ReactElement } from "react";
import { BarChart, Box, Gauge, Panel, StatusBar, Table, Text, useInput, type Column } from "@uniview/tui-react";
import { commandName, sortProcesses, type Process, type SortDir, type SortKey } from "./sysinfo";

export interface AppHost {
  quit: () => void;
}

/** One live frame handed down from the sampler in main.tsx. */
export interface Frame {
  cpu: number; // overall busy %
  cores: number[]; // per-core busy %
  mem: number; // used memory %
  memUsedGB: number;
  memTotalGB: number;
  load1: number;
  processes: Process[];
}

/** A meter color band: green → yellow → red as utilization climbs. */
function band(pct: number): "green" | "yellow" | "red" {
  return pct >= 85 ? "red" : pct >= 60 ? "yellow" : "green";
}

/** Which column each sort key maps to, and its natural default direction. */
const KEY_LABEL: Record<SortKey, string> = {
  cpu: "CPU%",
  mem: "MEM%",
  time: "TIME",
  pid: "PID",
  command: "COMMAND",
  state: "S",
};

/**
 * An htop-style system monitor. A live CPU/MEM history plot and meters up top,
 * a sortable process table below. Data is sampled on an interval in main.tsx
 * (real `os` counters + `ps`); this component holds only the sort/cursor state,
 * so re-sorting is instant and independent of the next sample.
 *
 *   ↑/↓ PgUp/PgDn : move · C/M/T/P/N : sort by cpu/mem/time/pid/name · q : quit
 */
export function App({
  frame,
  cols,
  rows,
  host,
}: {
  frame: Frame;
  cols: number;
  rows: number;
  host: AppHost;
}): ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>("cpu");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [cursor, setCursor] = useState(0);

  const ordered = sortProcesses(frame.processes, sortKey, sortDir);
  const clamped = Math.max(0, Math.min(cursor, ordered.length - 1));

  const pickSort = (key: SortKey): void => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "command" || key === "state" ? "asc" : "desc"); // text asc, numbers desc
    }
  };

  const plotHeight = Math.max(5, Math.min(10, Math.floor((rows - 4) * 0.4)));
  const tableHeight = Math.max(3, rows - plotHeight - 5);

  useInput((input, k) => {
    const key = input.toLowerCase();
    if (key === "q") host.quit();
    else if (key === "c") pickSort("cpu");
    else if (key === "m") pickSort("mem");
    else if (key === "t") pickSort("time");
    else if (key === "p") pickSort("pid");
    else if (key === "n") pickSort("command");
    else if (k.upArrow) setCursor(() => Math.max(0, clamped - 1));
    else if (k.downArrow) setCursor(() => Math.min(ordered.length - 1, clamped + 1));
    else if (k.pageUp) setCursor(() => Math.max(0, clamped - tableHeight));
    else if (k.pageDown) setCursor(() => Math.min(ordered.length - 1, clamped + tableHeight));
  });

  const arrow = sortDir === "asc" ? " ▲" : " ▼";
  const head = (key: SortKey): string => KEY_LABEL[key] + (sortKey === key ? arrow : "");

  const columns: Column<Process>[] = [
    { key: "pid", header: head("pid"), accessor: (p) => String(p.pid), align: "right", width: 7 },
    { key: "cpu", header: head("cpu"), accessor: (p) => p.cpu.toFixed(1), align: "right", width: 6 },
    { key: "mem", header: head("mem"), accessor: (p) => p.mem.toFixed(1), align: "right", width: 6 },
    { key: "time", header: head("time"), accessor: (p) => p.etime, align: "right", width: 10 },
    { key: "state", header: head("state"), accessor: (p) => p.state, align: "center", width: 4 },
    { key: "command", header: head("command"), accessor: (p) => commandName(p.command), align: "left", minWidth: 10, flexGrow: 1 },
  ];

  const memWidth = Math.min(34, Math.max(24, Math.floor(cols * 0.32)));
  // Estimate the per-core panel's inner width so the bars roughly fill it.
  const coreArea = Math.max(cols - memWidth - 6, frame.cores.length * 2);
  const barGap = 1;
  const barWidth = Math.max(1, Math.floor(coreArea / frame.cores.length) - barGap);
  const memBar = Math.max(6, memWidth - 6);

  return h(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    h(
      Box,
      { flexDirection: "row" },
      h(
        Panel,
        { title: `CPU · ${frame.cpu.toFixed(0)}% avg · ${frame.cores.length} cores`, flexGrow: 1, height: plotHeight + 3 },
        h(BarChart, {
          data: frame.cores.map((v, i) => ({ label: String(i + 1), value: v, color: band(v) })),
          options: {
            height: plotHeight,
            max: 100,
            barWidth,
            gap: barGap,
            showValues: false,
            showLabels: frame.cores.length <= 16,
          },
        }),
      ),
      h(
        Panel,
        { title: "Memory", width: memWidth, height: plotHeight + 3 },
        h(
          Box,
          { flexDirection: "column" },
          h(Text, { bold: true, color: band(frame.mem) }, `${frame.mem.toFixed(1)}% used`),
          h(Gauge, {
            fraction: frame.mem / 100,
            options: { width: memBar, color: band(frame.mem), label: `${frame.mem.toFixed(0)}%` },
          }),
          h(Text, { color: "gray" }, `${frame.memUsedGB.toFixed(1)} / ${frame.memTotalGB.toFixed(1)} GB`),
          h(Text, { color: "gray" }, `load ${frame.load1.toFixed(2)}`),
          h(Text, { color: "gray" }, `${frame.processes.length} processes`),
        ),
      ),
    ),
    h(
      Panel,
      { title: `Processes · sorted by ${KEY_LABEL[sortKey]}${arrow.trim()}`, flexGrow: 1 },
      h(Table<Process>, {
        columns,
        rows: ordered,
        selectedIndex: clamped,
        onSelect: setCursor,
        height: tableHeight,
        width: Math.max(20, cols - 2),
        sort: null,
      }),
    ),
    h(StatusBar, {
      height: 1,
      items: [
        { label: "sort", keyHint: "C·M·T·P·N" },
        { label: "move", keyHint: "↑↓" },
        { label: "quit", keyHint: "q" },
      ],
    }),
  );
}
