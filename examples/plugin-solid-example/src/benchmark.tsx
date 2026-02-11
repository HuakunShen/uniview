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

// Extended lorem ipsum word list for longer text
const LOREM_WORDS = [
	"lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit",
	"sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore",
	"magna", "aliqua", "enim", "ad", "minim", "veniam", "quis", "nostrud",
	"exercitation", "ullamco", "laboris", "nisi", "aliquip", "ex", "ea", "commodo",
	"consequat", "duis", "aute", "irure", "in", "reprehenderit", "voluptate",
	"velit", "esse", "cillum", "fugiat", "nulla", "pariatur", "excepteur", "sint",
	"occaecat", "cupidatat", "non", "proident", "sunt", "culpa", "qui", "officia",
	"deserunt", "mollit", "anim", "id", "est", "laborum", "perspiciatis", "unde",
	"omnis", "iste", "natus", "error", "voluptatem", "accusantium", "doloremque",
	"laudantium", "totam", "rem", "aperiam", "eaque", "ipsa", "quae", "ab", "illo",
	"inventore", "veritatis", "quasi", "architecto", "beatae", "vitae", "dicta",
	"sunt", "explicabo", "nemo", "ipsam", "voluptas", "sint", "obcaecati", "aut",
	"odit", "aut", "fugit", "sed", "quia", "consequuntur", "magni", "dolores",
	"eos", "ratione", "sequi", "nesciunt", "neque", "porro", "quisquam", "dolorem",
];

// Deterministic pseudo-random number generator using a simple LCG
// This ensures the same sequence of "random" operations every run
class SeededRandom {
	private seed: number;

	constructor(seed: number = 12345) {
		this.seed = seed;
	}

	// Linear Congruential Generator
	next(): number {
		this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
		return this.seed / 4294967296;
	}

	// Get random integer in range [min, max)
	nextInt(min: number, max: number): number {
		return Math.floor(this.next() * (max - min)) + min;
	}

	// Get random item from array
	pick<T>(arr: T[]): T {
		return arr[this.nextInt(0, arr.length)];
	}
}

const rng = new SeededRandom(12345);

// Generate lorem ipsum text with deterministic "randomness"
function generateLorem(wordCount: number): string {
	const words: string[] = [];
	for (let i = 0; i < wordCount; i++) {
		words.push(rng.pick(LOREM_WORDS));
	}
	return words.join(" ");
}

// Configuration for stress testing
const CONFIG = {
	INITIAL_ITEMS: 500,
	MAX_ITEMS: 1000,
	WORDS_PER_ITEM: 100, // Much longer text (was 20)
	BATCH_SIZE: 50, // Insert/remove 50 items at a time (was 10)
	AUTO_BENCHMARK_INTERVAL: 50, // Faster interval (was 100ms)
	AUTO_BENCHMARK_CYCLES: 200, // More cycles (was 50)
	ITEMS_PER_AUTO_OP: 25, // More items per auto operation (was 5)
};

export function BenchmarkApp() {
	// Reset RNG for consistent initial state
	rng["seed"] = 12345;

	// Initialize with configured number of items
	const initialItems: BenchmarkItem[] = [];
	for (let i = 0; i < CONFIG.INITIAL_ITEMS; i++) {
		initialItems.push({
			id: i,
			text: generateLorem(CONFIG.WORDS_PER_ITEM),
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

	let nextId = CONFIG.INITIAL_ITEMS;
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

	// Insert items at random positions
	const addItems = () => {
		const start = performance.now();
		const newItems: BenchmarkItem[] = [];
		for (let i = 0; i < CONFIG.BATCH_SIZE; i++) {
			newItems.push({
				id: nextId++,
				text: generateLorem(CONFIG.WORDS_PER_ITEM),
			});
		}
		setItems((prev) => {
			if (prev.length >= CONFIG.MAX_ITEMS) return prev;

			// Create a copy and insert at random positions
			const updated = [...prev];
			for (const item of newItems) {
				if (updated.length >= CONFIG.MAX_ITEMS) break;
				// Insert at random position
				const insertPos = rng.nextInt(0, updated.length + 1);
				updated.splice(insertPos, 0, item);
			}
			return updated;
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	// Remove items from random positions
	const removeItems = () => {
		const start = performance.now();
		setItems((prev) => {
			if (prev.length === 0) return prev;
			const updated = [...prev];
			const removeCount = Math.min(CONFIG.BATCH_SIZE, updated.length);

			// Remove from random positions
			for (let i = 0; i < removeCount; i++) {
				if (updated.length === 0) break;
				const removePos = rng.nextInt(0, updated.length);
				updated.splice(removePos, 1);
			}
			return updated;
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	// Mixed operation: add AND remove simultaneously (high stress)
	const mixedOperation = () => {
		const start = performance.now();
		setItems((prev) => {
			const updated = [...prev];

			// First remove some items from random positions
			const removeCount = Math.min(CONFIG.BATCH_SIZE, updated.length);
			for (let i = 0; i < removeCount; i++) {
				if (updated.length === 0) break;
				const removePos = rng.nextInt(0, updated.length);
				updated.splice(removePos, 1);
			}

			// Then add new items at random positions
			const addCount = CONFIG.BATCH_SIZE;
			for (let i = 0; i < addCount; i++) {
				if (updated.length >= CONFIG.MAX_ITEMS) break;
				const newItem = {
					id: nextId++,
					text: generateLorem(CONFIG.WORDS_PER_ITEM),
				};
				const insertPos = rng.nextInt(0, updated.length + 1);
				updated.splice(insertPos, 0, newItem);
			}

			return updated;
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	const updateAllTexts = () => {
		const start = performance.now();
		setItems((prev) =>
			prev.map((item) => ({
				...item,
				text: generateLorem(CONFIG.WORDS_PER_ITEM),
			})),
		);
		setTimeout(() => updateStats(performance.now() - start), 0);
	};

	const updateSingleItem = () => {
		const start = performance.now();
		setItems((prev) => {
			if (prev.length === 0) return prev;
			const index = rng.nextInt(0, prev.length);
			return prev.map((item, i) =>
				i === index ? { ...item, text: generateLorem(CONFIG.WORDS_PER_ITEM) } : item,
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
		const maxCycles = CONFIG.AUTO_BENCHMARK_CYCLES;

		intervalId = setInterval(() => {
			// Stop if we've reached max cycles
			if (cycles >= maxCycles) {
				stopBenchmark();
				return;
			}

			const start = performance.now();

			// Cycle through different operations for variety
			const operationType = cycles % 5;

			setItems((prev) => {
				const updated = [...prev];

				switch (operationType) {
					case 0: // Random position insert
					case 1: {
						for (let i = 0; i < CONFIG.ITEMS_PER_AUTO_OP; i++) {
							if (updated.length >= CONFIG.MAX_ITEMS) break;
							const newItem = {
								id: nextId++,
								text: generateLorem(CONFIG.WORDS_PER_ITEM),
							};
							const insertPos = rng.nextInt(0, updated.length + 1);
							updated.splice(insertPos, 0, newItem);
						}
						break;
					}
					case 2: // Random position remove
					case 3: {
						for (let i = 0; i < CONFIG.ITEMS_PER_AUTO_OP; i++) {
							if (updated.length === 0) break;
							const removePos = rng.nextInt(0, updated.length);
							updated.splice(removePos, 1);
						}
						break;
					}
					case 4: // Mixed: remove then insert
					default: {
						// Remove some
						for (let i = 0; i < CONFIG.ITEMS_PER_AUTO_OP / 2; i++) {
							if (updated.length === 0) break;
							const removePos = rng.nextInt(0, updated.length);
							updated.splice(removePos, 1);
						}
						// Insert some
						for (let i = 0; i < CONFIG.ITEMS_PER_AUTO_OP / 2; i++) {
							if (updated.length >= CONFIG.MAX_ITEMS) break;
							const newItem = {
								id: nextId++,
								text: generateLorem(CONFIG.WORDS_PER_ITEM),
							};
							const insertPos = rng.nextInt(0, updated.length + 1);
							updated.splice(insertPos, 0, newItem);
						}
						break;
					}
				}

				return updated;
			});

			setTimeout(() => updateStats(performance.now() - start), 0);
			cycles++;
		}, CONFIG.AUTO_BENCHMARK_INTERVAL);
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
			<h1>Solid Benchmark (High Stress)</h1>

			<div style={{ "margin-bottom": "20px" }}>
				<div>Item count: {items().length} / {CONFIG.MAX_ITEMS} (max)</div>
				<div style={{ "font-size": "12px", color: "#666" }}>
					Initial: {CONFIG.INITIAL_ITEMS} | Batch: {CONFIG.BATCH_SIZE} | Text: {CONFIG.WORDS_PER_ITEM} words/item
				</div>
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
				<Button title={`Add ${CONFIG.BATCH_SIZE} Items (Random Pos)`} variant="primary" onClick={addItems} />
				<Button title={`Remove ${CONFIG.BATCH_SIZE} Items (Random Pos)`} variant="secondary" onClick={removeItems} />
				<Button title="Mixed: Remove+Insert" variant="primary" onClick={mixedOperation} />
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
