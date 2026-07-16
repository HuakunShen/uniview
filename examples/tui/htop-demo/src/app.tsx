import { createElement as h, useState, type ReactElement } from "react";
import { Box, LineChart, LineGauge, Panel, StatusBar, Table, Text, useInput, type Column } from "@uniview/tui-react";
import { commandName, sortProcesses, type Process, type SortDir, type SortKey } from "./sysinfo";

export interface AppHost {
  quit: () => void;
}

/** One live frame handed down from the sampler in main.tsx. */
export interface Frame {
  cpu: number;
  mem: number;
  cores: number;
  load1: number;
  processes: Process[];
  cpuHist: number[];
  memHist: number[];
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

  const plotWidth = Math.max(20, Math.floor(cols * 0.62) - 2);
  const meterWidth = Math.max(10, Math.floor(cols * 0.38) - 6);

  return h(
    Box,
    { flexDirection: "column", width: "100%", height: "100%" },
    h(
      Box,
      { flexDirection: "row" },
      h(
        Panel,
        { title: `History · last ${frame.cpuHist.length}s`, flexGrow: 1, height: plotHeight + 2 },
        h(LineChart, {
          series: [
            { points: frame.cpuHist.map((v, i) => [i, v] as [number, number]), color: "green", label: "CPU" },
            { points: frame.memHist.map((v, i) => [i, v] as [number, number]), color: "cyan", label: "MEM" },
          ],
          options: {
            width: plotWidth,
            height: plotHeight,
            yBounds: [0, 100],
            xBounds: [0, Math.max(1, frame.cpuHist.length - 1)],
            legend: { position: "top" },
          },
        }),
      ),
      h(
        Panel,
        { title: "System", width: Math.max(18, Math.floor(cols * 0.38)), height: plotHeight + 2 },
        h(
          Box,
          { flexDirection: "column" },
          h(LineGauge, { fraction: frame.cpu / 100, options: { width: meterWidth, label: "CPU", color: band(frame.cpu) } }),
          h(LineGauge, { fraction: frame.mem / 100, options: { width: meterWidth, label: "MEM", color: band(frame.mem) } }),
          h(Text, { color: "gray" }, `${frame.cores} cores · load ${frame.load1.toFixed(2)}`),
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
