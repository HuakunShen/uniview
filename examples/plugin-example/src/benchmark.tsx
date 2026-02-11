import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@uniview/example-plugin-api";

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
	const [items, setItems] = useState<BenchmarkItem[]>(() => {
		const initial: BenchmarkItem[] = [];
		for (let i = 0; i < CONFIG.INITIAL_ITEMS; i++) {
			initial.push({
				id: i,
				text: generateLorem(CONFIG.WORDS_PER_ITEM),
			});
		}
		return initial;
	});

	const [stats, setStats] = useState<{
		lastOpTime: number;
		totalBytes: number;
		totalMessages: number;
	}>({
		lastOpTime: 0,
		totalBytes: 0,
		totalMessages: 0,
	});

	const [isRunning, setIsRunning] = useState(false);

	// Track operation-level metrics
	const opMetricsRef = useRef<OperationMetrics>({
		opCount: 0,
		totalOpTime: 0,
		totalMessagesAtStart: 0,
	});
	const lastOpMessagesRef = useRef(0);

	const nextIdRef = useRef(CONFIG.INITIAL_ITEMS);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Read stats from global
	const updateStats = useCallback((opTime: number) => {
		const globalStats = (globalThis as unknown as { __uniview_stats?: Stats })
			.__uniview_stats;
		if (globalStats) {
			// Track operation metrics
			opMetricsRef.current.opCount++;
			opMetricsRef.current.totalOpTime += opTime;
			lastOpMessagesRef.current = globalStats.messagesSent - opMetricsRef.current.totalMessagesAtStart;
			opMetricsRef.current.totalMessagesAtStart = globalStats.messagesSent;

			setStats({
				lastOpTime: opTime,
				totalBytes: globalStats.bytesSent,
				totalMessages: globalStats.messagesSent,
			});
		}
	}, []);

	const stopBenchmark = useCallback(() => {
		if (intervalRef.current) {
			clearInterval(intervalRef.current);
			intervalRef.current = null;
		}
		setIsRunning(false);
	}, []);

	// Insert items at random positions
	const addItems = useCallback(() => {
		const start = performance.now();
		const newItems: BenchmarkItem[] = [];
		for (let i = 0; i < CONFIG.BATCH_SIZE; i++) {
			newItems.push({
				id: nextIdRef.current++,
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
	}, [updateStats]);

	// Remove items from random positions
	const removeItems = useCallback(() => {
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
	}, [updateStats]);

	// Mixed operation: add AND remove simultaneously (high stress)
	const mixedOperation = useCallback(() => {
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
					id: nextIdRef.current++,
					text: generateLorem(CONFIG.WORDS_PER_ITEM),
				};
				const insertPos = rng.nextInt(0, updated.length + 1);
				updated.splice(insertPos, 0, newItem);
			}

			return updated;
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	}, [updateStats]);

	const updateAllTexts = useCallback(() => {
		const start = performance.now();
		setItems((prev) =>
			prev.map((item) => ({
				...item,
				text: generateLorem(CONFIG.WORDS_PER_ITEM),
			})),
		);
		setTimeout(() => updateStats(performance.now() - start), 0);
	}, [updateStats]);

	const updateSingleItem = useCallback(() => {
		const start = performance.now();
		setItems((prev) => {
			if (prev.length === 0) return prev;
			const index = rng.nextInt(0, prev.length);
			return prev.map((item, i) =>
				i === index ? { ...item, text: generateLorem(CONFIG.WORDS_PER_ITEM) } : item,
			);
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	}, [updateStats]);

	const runAutoBenchmark = useCallback(() => {
		if (intervalRef.current) {
			stopBenchmark();
			return;
		}

		setIsRunning(true);
		let cycles = 0;
		const maxCycles = CONFIG.AUTO_BENCHMARK_CYCLES;

		intervalRef.current = setInterval(() => {
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
								id: nextIdRef.current++,
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
								id: nextIdRef.current++,
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
	}, [stopBenchmark, updateStats]);

	useEffect(() => {
		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, []);

	// Calculate metrics
	const bytesPerMessage =
		stats.totalMessages > 0 ? stats.totalBytes / stats.totalMessages : 0;

	const avgOpTime =
		opMetricsRef.current.opCount > 0
			? opMetricsRef.current.totalOpTime / opMetricsRef.current.opCount
			: 0;

	const avgMessagesPerOp =
		opMetricsRef.current.opCount > 0
			? stats.totalMessages / opMetricsRef.current.opCount
			: 0;

	const avgBytesPerOp =
		opMetricsRef.current.opCount > 0
			? stats.totalBytes / opMetricsRef.current.opCount
			: 0;

	const avgTimePerMessage =
		stats.totalMessages > 0
			? opMetricsRef.current.totalOpTime / stats.totalMessages
			: 0;

	const lastOpMessages = lastOpMessagesRef.current;

	return (
		<div style={{ padding: "20px", fontFamily: "system-ui, sans-serif" }}>
			<h1>React Benchmark (High Stress)</h1>

			<div style={{ marginBottom: "20px" }}>
				<div>Item count: {items.length} / {CONFIG.MAX_ITEMS} (max)</div>
				<div style={{ fontSize: "12px", color: "#666" }}>
					Initial: {CONFIG.INITIAL_ITEMS} | Batch: {CONFIG.BATCH_SIZE} | Text: {CONFIG.WORDS_PER_ITEM} words/item
				</div>
			</div>

			{/* Operation-Level Metrics */}
			<div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#1a1a2e", borderRadius: "8px" }}>
				<h3 style={{ margin: "0 0 10px 0", color: "#eee" }}>Operation Metrics (Per Click)</h3>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", color: "#ccc", fontSize: "14px" }}>
					<div>Operations performed: {opMetricsRef.current.opCount}</div>
					<div>Last operation: {stats.lastOpTime.toFixed(2)}ms</div>
					<div>Avg time/operation: {avgOpTime.toFixed(2)}ms</div>
					<div>Messages in last op: {lastOpMessages}</div>
					<div>Avg messages/op: {avgMessagesPerOp.toFixed(2)}</div>
					<div>Avg bytes/op: {avgBytesPerOp.toFixed(0)}</div>
				</div>
			</div>

			{/* Message-Level Metrics */}
			<div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#16213e", borderRadius: "8px" }}>
				<h3 style={{ margin: "0 0 10px 0", color: "#eee" }}>Message Metrics (Per Message)</h3>
				<div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", color: "#ccc", fontSize: "14px" }}>
					<div>Total messages: {stats.totalMessages}</div>
					<div>Total bytes: {(stats.totalBytes / 1024 / 1024).toFixed(2)} MB</div>
					<div>Bytes/message: {bytesPerMessage.toFixed(0)}</div>
					<div>Time/message: {(avgTimePerMessage * 1000).toFixed(2)}μs</div>
				</div>
			</div>

			<div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
				<Button title={`Add ${CONFIG.BATCH_SIZE} Items (Random Pos)`} variant="primary" onClick={addItems} />
				<Button title={`Remove ${CONFIG.BATCH_SIZE} Items (Random Pos)`} variant="secondary" onClick={removeItems} />
				<Button title="Mixed: Remove+Insert" variant="primary" onClick={mixedOperation} />
				<Button title="Update All Texts" variant="outline" onClick={updateAllTexts} />
				<Button title="Update Single Item" variant="outline" onClick={updateSingleItem} />
				<Button
					title={isRunning ? "Stop" : "Run Auto-Benchmark"}
					variant="primary"
					onClick={runAutoBenchmark}
				/>
			</div>

			<div
				style={{
					maxHeight: "400px",
					overflow: "auto",
					border: "1px solid #ccc",
					padding: "10px",
				}}
			>
				{items.map((item) => (
					<div
						key={item.id}
						style={{
							padding: "5px",
							borderBottom: "1px solid #eee",
						}}
					>
						<span style={{ fontWeight: "bold" }}>#{item.id}:</span>{" "}
						{item.text.substring(0, 100)}...
					</div>
				))}
			</div>
		</div>
	);
}
