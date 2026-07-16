/**
 * Developer quickstart: numbered steps plus a real plugin code sample rendered
 * with the docs' Shiki-backed DynamicCodeBlock so highlighting matches the docs
 * pages.
 */

import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { btnPrimary, DocLink } from "./shared";

const STEPS = [
  "Author a component tree in React or Solid.",
  "The renderer serializes it to a UINode tree — no DOM involved.",
  "Boot the plugin in a Worker, over the bridge, or on the main thread.",
  "A host renders it to DOM, a terminal, or a native window.",
];

const CODE_SAMPLE = `import { useState } from "react"
import { Stack, Text, Button } from "@uniview/react-runtime"

export default function Counter() {
  const [count, setCount] = useState(0)
  return (
    <Stack className="p-4 gap-2">
      <Text>Counter</Text>
      <Text>{count}</Text>
      <Button onClick={() => setCount((c) => c + 1)}>+1</Button>
    </Stack>
  )
}`;

export function Quickstart() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <span className="text-sm font-semibold uppercase tracking-wide text-fd-primary">
            Quickstart
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Your first plugin in minutes
          </h2>
          <p className="mt-3 text-fd-muted-foreground">
            Write an ordinary component. Uniview handles the tree, the
            transport, and the render — the same source runs on every host.
          </p>

          <ol className="mt-6 space-y-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-fd-primary text-xs font-bold text-fd-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm text-fd-foreground">{step}</span>
              </li>
            ))}
          </ol>

          <DocLink path="getting-started" className={cn(btnPrimary, "mt-8")}>
            Read the full guide <ArrowRight className="size-4" />
          </DocLink>
        </div>

        <div className="min-w-0 shadow-xl [&_figure]:my-0">
          <DynamicCodeBlock
            lang="tsx"
            code={CODE_SAMPLE}
            codeblock={{ title: "Counter.tsx" }}
          />
        </div>
      </div>
    </section>
  );
}
