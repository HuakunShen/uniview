import { createSignal, For } from "solid-js"
import type { Component } from "solid-js"

const ITEM_COUNT = 500
const ITERATIONS = 100

function generateItems(start: number, count: number): string[] {
	const items: string[] = []
	for (let i = 0; i < count; i++) {
		items.push(`item-${start + i}`)
	}
	return items
}

const Benchmark: Component = () => {
	const [items, setItems] = createSignal(generateItems(0, ITEM_COUNT))
	const [running, setRunning] = createSignal(false)
	const [totalTime, setTotalTime] = createSignal<number | null>(null)
	const [perIteration, setPerIteration] = createSignal<number | null>(null)

	const runBenchmark = async () => {
		setRunning(true)
		setTotalTime(null)
		setPerIteration(null)

		// Reset items
		setItems(generateItems(0, ITEM_COUNT))
		await new Promise((r) => setTimeout(r, 0))

		let id = ITEM_COUNT
		let current = generateItems(0, ITEM_COUNT)

		const start = performance.now()

		for (let i = 0; i < ITERATIONS; i++) {
			const newItem = `item-${id++}`
			const next = current.slice(1)
			next.push(newItem)
			current = next

			setItems([...current])
			await new Promise((r) => queueMicrotask(r))
		}

		const end = performance.now()
		const total = end - start

		setRunning(false)
		setTotalTime(Math.round(total * 100) / 100)
		setPerIteration(Math.round((total / ITERATIONS) * 100) / 100)
	}

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
					"background-color": running()
						? "rgba(113, 113, 122, 0.3)"
						: "rgba(139, 92, 246, 0.2)",
					color: running()
						? "rgb(161, 161, 170)"
						: "rgb(196, 181, 253)",
					border: running()
						? "1px solid rgba(113, 113, 122, 0.3)"
						: "1px solid rgba(139, 92, 246, 0.3)",
				}}
				onClick={() => {
					if (!running()) runBenchmark()
				}}
			>
				{running() ? "Running..." : "Run Benchmark"}
			</div>

			{totalTime() !== null && (
				<div
					className="space-y-2 rounded-lg p-4"
					style={{
						"background-color": "rgba(139, 92, 246, 0.1)",
						border: "1px solid rgba(139, 92, 246, 0.2)",
					}}
				>
					<div className="flex justify-between text-sm">
						<span className="text-zinc-400">Total time:</span>
						<span className="font-mono text-zinc-100">
							{totalTime()}ms
						</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-zinc-400">Per iteration:</span>
						<span className="font-mono text-zinc-100">
							{perIteration()}ms
						</span>
					</div>
					<div className="flex justify-between text-sm">
						<span className="text-zinc-400">Items:</span>
						<span className="font-mono text-zinc-100">
							{ITEM_COUNT}
						</span>
					</div>
				</div>
			)}

			<div
				className="max-h-[200px] overflow-y-auto rounded-lg p-2"
				style={{ "background-color": "rgba(0, 0, 0, 0.3)" }}
			>
				<For each={items()}>
					{(item) => (
						<div className="px-2 py-0.5 text-xs font-mono text-zinc-500">
							{item}
						</div>
					)}
				</For>
			</div>
		</div>
	)
}

export default Benchmark
