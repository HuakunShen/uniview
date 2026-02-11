import { createSignal, For, onCleanup } from "solid-js";
import { Button } from "@uniview/example-solid-plugin-api";

interface BenchmarkItem {
	id: number;
	text: string;
}

interface Stats {
	bytesSent: number;
	messagesSent: number;
}

interface OperationMetrics {
	opCount: number;
	totalOpTime: number;
	totalMessagesAtStart: number;
}

// Generate lorem ipsum text
function generateLorem(length: number): string {
	const words = [
		"lorem",
		"ipsum",
		"dolor",
		"sit",
		"amet",
		"consectetur",
		"adipiscing",
		"elit",
		"sed",
		"do",
		"eiusmod",
		"tempor",
		"incididunt",
		"ut",
		"labore",
		"et",
		"dolore",
		"magna",
		"aliqua",
	];
	let result = "";
	for (let i = 0; i < length; i++) {
		result += words[Math.floor(Math.random() * words.length)] + " ";
	}
	return result.trim();
}

const MAX_ITEMS = 2000;

export function BenchmarkApp() {
	// Initialize with 1000 items
	const initialItems: BenchmarkItem[] = [];
	for (let i = 0; i < 1000; i++) {
		initialItems.push({
			id: i,
			text: generateLorem(20),
		});
	}

	const [items, setItems] = createSignal<BenchmarkItem[]>(initialItems);
	const [lastOpTime, setLastOpTime] = createSignal(0);
	const [totalBytes, setTotalBytes] = createSignal(0);
	const [totalMessages, setTotalMessages] = createSignal(0);
	const [isRunning, setIsRunning] = createSignal(false);
	const [opCount, setOpCount] = createSignal(0);
	const [totalOpTime, setTotalOpTime] = createSignal(0);
	const [lastOpMessages, setLastOpMessages] = createSignal(0);

	let nextId = 1000;
	let intervalId: ReturnType<typeof setInterval> | null = null;
	let totalMessagesAtStart = 0;

	// Read stats from global
	const updateStats = (opTime: number) => {
		const globalStats = (globalThis as unknown as { __uniview_stats?: Stats })
			.__uniview_stats;
		if (globalStats) {
			setOpCount((c) => c + 1);
			setTotalOpTime((t) => t + opTime);
			setLastOpMessages(globalStats.messagesSent - totalMessagesAtStart);
			totalMessagesAtStart = globalStats.messagesSent;

			setLastOpTime(opTime);
			setTotalBytes(globalStats.bytesSent);
			setTotalMessages(globalStats.messagesSent);
		}
	};

	const stopBenchmark = () => {
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
		setIsRunning(false);
	};

	const addItems = () => {
		const start = performance.now();
		const newItems: BenchmarkItem[] = [];
		for (let i = 0; i < 10; i++) {
			newItems.push({
				id: nextId++,
				text: generateLorem(20),
			});
		}
		setItems((prev) => {
			const updated = [...prev, ...newItems];
			if (updated.length >= MAX_ITEMS && intervalId) {
				stopBenchmark();
			}
			return updated.slice(0, MAX_ITEMS);
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	const removeItems = () => {
		const start = performance.now();
		setItems((prev) => prev.slice(0, -10));
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	const updateAllTexts = () => {
		const start = performance.now();
		setItems((prev) =>
			prev.map((item) => ({
				...item,
				text: generateLorem(20),
			})),
		);
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	const updateSingleItem = () => {
		const start = performance.now();
		setItems((prev) => {
			if (prev.length === 0) return prev;
			const index = Math.floor(Math.random() * prev.length);
			return prev.map((item, i) =>
				i === index ? { ...item, text: generateLorem(20) } : item,
			);
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	const runAutoBenchmark = () => {
		if (intervalId) {
			stopBenchmark();
			return;
		}

		setIsRunning(true);
		let cycles = 0;
		const maxCycles = 50;

		intervalId = setInterval(() => {
			if (cycles >= maxCycles) {
				stopBenchmark();
				return;
			}

			// Alternate between add and modify
			if (cycles % 2 === 0) {
				const start = performance.now();
				const newItems: BenchmarkItem[] = [];
				for (let i = 0; i < 5; i++) {
					newItems.push({
						id: nextId++,
						text: generateLorem(20),
					});
				}
				setItems((prev) => {
					const updated = [...prev, ...newItems];
					if (updated.length >= MAX_ITEMS) {
						stopBenchmark();
					}
					return updated.slice(0, MAX_ITEMS);
				});
				setTimeout(() => updateStats(performance.now() - start), 0);
			} else {
				const start = performance.now();
				setItems((prev) => {
					if (prev.length === 0) return prev;
					const index = Math.floor(Math.random() * prev.length);
					return prev.map((item, i) =>
						i === index ? { ...item, text: generateLorem(20) } : item,
					);
				});
				setTimeout(() => updateStats(performance.now() - start), 0);
			}
			cycles++;
		}, 100);
	};

	onCleanup(() => {
		if (intervalId) {
			clearInterval(intervalId);
		}
	});

	// Calculate metrics
	const bytesPerMessage = () =>
		totalMessages() > 0 ? totalBytes() / totalMessages() : 0;

	const avgOpTime = () =>
		opCount() > 0 ? totalOpTime() / opCount() : 0;

	const avgMessagesPerOp = () =>
		opCount() > 0 ? totalMessages() / opCount() : 0;

	const avgBytesPerOp = () =>
		opCount() > 0 ? totalBytes() / opCount() : 0;

	const avgTimePerMessage = () =>
		totalMessages() > 0 ? totalOpTime() / totalMessages() : 0;

	return (
		<div style={{ padding: "20px", "font-family": "system-ui, sans-serif" }}>
			<h1>Solid Benchmark</h1>

			<div style={{ "margin-bottom": "20px" }}>
				<div>Item count: {items().length} / {MAX_ITEMS} (max)</div>
			</div>

			{/* Operation-Level Metrics */}
			<div style={{ "margin-bottom": "20px", padding: "15px", "background-color": "#1a1a2e", "border-radius": "8px" }}>
				<h3 style={{ margin: "0 0 10px 0", color: "#eee" }}>Operation Metrics (Per Click)</h3>
				<div style={{ display: "grid", "grid-template-columns": "repeat(2, 1fr)", gap: "8px", color: "#ccc", "font-size": "14px" }}>
					<div>Operations performed: {opCount()}</div>
					<div>Last operation: {lastOpTime().toFixed(2)}ms</div>
					<div>Avg time/operation: {avgOpTime().toFixed(2)}ms</div>
					<div>Messages in last op: {lastOpMessages()}</div>
					<div>Avg messages/op: {avgMessagesPerOp().toFixed(2)}</div>
					<div>Avg bytes/op: {avgBytesPerOp().toFixed(0)}</div>
				</div>
			</div>

			{/* Message-Level Metrics */}
			<div style={{ "margin-bottom": "20px", padding: "15px", "background-color": "#16213e", "border-radius": "8px" }}>
				<h3 style={{ margin: "0 0 10px 0", color: "#eee" }}>Message Metrics (Per Message)</h3>
				<div style={{ display: "grid", "grid-template-columns": "repeat(2, 1fr)", gap: "8px", color: "#ccc", "font-size": "14px" }}>
					<div>Total messages: {totalMessages()}</div>
					<div>Total bytes: {(totalBytes() / 1024 / 1024).toFixed(2)} MB</div>
					<div>Bytes/message: {bytesPerMessage().toFixed(0)}</div>
					<div>Time/message: {(avgTimePerMessage() * 1000).toFixed(2)}μs</div>
				</div>
			</div>

			<div style={{ display: "flex", gap: "10px", "margin-bottom": "20px", "flex-wrap": "wrap" }}>
				<Button title="Add 10 Items" variant="primary" onClick={addItems} />
				<Button title="Remove 10 Items" variant="secondary" onClick={removeItems} />
				<Button title="Update All Texts" variant="outline" onClick={updateAllTexts} />
				<Button title="Update Single Item" variant="outline" onClick={updateSingleItem} />
				<Button
					title={isRunning() ? "Stop" : "Run Auto-Benchmark"}
					variant="primary"
					onClick={runAutoBenchmark}
				/>
			</div>

			<div
				style={{
					"max-height": "400px",
					overflow: "auto",
					border: "1px solid #ccc",
					padding: "10px",
				}}
			>
				<For each={items()}>
					{(item) => (
						<div
							style={{
								padding: "5px",
								"border-bottom": "1px solid #eee",
							}}
						>
							<span style={{ "font-weight": "bold" }}>#{item.id}:</span>{" "}
							{item.text.substring(0, 100)}...
						</div>
					)}
				</For>
			</div>
		</div>
	);
}
