# @uniview/tui-charts

Charts for the Uniview TUI: **bar**, **histogram**, **sparkline**, **gauge**,
**line**, and **scatter** — as a structured styled-text model, never raw ANSI
strings. Charts ride the same `RenderNode` / richtext-span pipeline as the
rest of the TUI stack, so layout, selection, and streaming keep working.

This package is pure and framework-agnostic: it depends only on
`@uniview/tui-core` and has no React or terminal I/O dependency, so chart
builders can be consumed from any host runtime (Web Worker, Node, Deno, Bun).
