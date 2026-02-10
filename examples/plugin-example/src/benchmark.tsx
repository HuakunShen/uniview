import { useState, useCallback } from "react";
import { flushSync } from "@uniview/runtime";

const ITEM_COUNT = 500;
const ITERATIONS = 100;

function generateItems(start: number, count: number): string[] {
  const items: string[] = [];
  for (let i = 0; i < count; i++) {
    items.push(`item-${start + i}`);
  }
  return items;
}

export default function Benchmark() {
  const [items, setItems] = useState(() => generateItems(0, ITEM_COUNT));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    total: number;
    perIteration: number;
  } | null>(null);
  const [nextId, setNextId] = useState(ITEM_COUNT);

  const runBenchmark = useCallback(() => {
    setRunning(true);
    setResult(null);

    // Reset items before starting
    const startItems = generateItems(0, ITEM_COUNT);
    flushSync(() => {
      setItems(startItems);
      setNextId(ITEM_COUNT);
    });

    let id = ITEM_COUNT;
    let current = startItems;

    const start = performance.now();

    for (let i = 0; i < ITERATIONS; i++) {
      const newItem = `item-${id++}`;
      const next = current.slice(1);
      next.push(newItem);
      current = next;

      flushSync(() => {
        setItems(current);
      });
    }

    const end = performance.now();
    const total = end - start;

    flushSync(() => {
      setNextId(id);
      setRunning(false);
      setResult({
        total: Math.round(total * 100) / 100,
        perIteration: Math.round((total / ITERATIONS) * 100) / 100,
      });
    });
  }, []);

  return (
    <div className="p-6 max-w-md mx-auto space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
          Benchmark
        </h2>
        <p className="text-sm text-zinc-400">
          {ITEM_COUNT} items, {ITERATIONS} insert/remove iterations
        </p>
      </div>

      <div
        className="cursor-pointer select-none rounded-lg px-4 py-2 text-center text-sm font-medium"
        style={{
          backgroundColor: running ? "rgba(113, 113, 122, 0.3)" : "rgba(139, 92, 246, 0.2)",
          color: running ? "rgb(161, 161, 170)" : "rgb(196, 181, 253)",
          border: running ? "1px solid rgba(113, 113, 122, 0.3)" : "1px solid rgba(139, 92, 246, 0.3)",
        }}
        onClick={running ? undefined : runBenchmark}
      >
        {running ? "Running..." : "Run Benchmark"}
      </div>

      {result && (
        <div className="space-y-2 rounded-lg p-4" style={{ backgroundColor: "rgba(139, 92, 246, 0.1)", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Total time:</span>
            <span className="font-mono text-zinc-100">{result.total}ms</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Per iteration:</span>
            <span className="font-mono text-zinc-100">{result.perIteration}ms</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Items:</span>
            <span className="font-mono text-zinc-100">{ITEM_COUNT}</span>
          </div>
        </div>
      )}

      <div className="max-h-[200px] overflow-y-auto rounded-lg p-2" style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}>
        {items.map((item) => (
          <div
            key={item}
            className="px-2 py-0.5 text-xs font-mono text-zinc-500"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
