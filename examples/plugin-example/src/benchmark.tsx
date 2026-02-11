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
	const [items, setItems] = useState<BenchmarkItem[]>(() => {
		const initial: BenchmarkItem[] = [];
		for (let i = 0; i < 1000; i++) {
			initial.push({
				id: i,
				text: generateLorem(20),
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

	const nextIdRef = useRef(1000);
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

	const addItems = useCallback(() => {
		const start = performance.now();
		const newItems: BenchmarkItem[] = [];
		for (let i = 0; i < 10; i++) {
			newItems.push({
				id: nextIdRef.current++,
				text: generateLorem(20),
			});
		}
		setItems((prev) => {
			const updated = [...prev, ...newItems];
			// Auto-stop if we hit the max
			if (updated.length >= MAX_ITEMS && intervalRef.current) {
				stopBenchmark();
			}
			return updated.slice(0, MAX_ITEMS);
		});
		setTimeout(() => updateStats(performance.now() - start), 0);
	}, [updateStats, stopBenchmark]);

	const removeItems = useCallback(() => {
		const start = performance.now();
		setItems((prev) => prev.slice(0, -10));
		setTimeout(() => updateStats(performance.now() - start), 0);
	}, [updateStats]);

	const updateAllTexts = useCallback(() => {
		const start = performance.now();
		setItems((prev) =>
			prev.map((item) => ({
				...item,
				text: generateLorem(20),
			})),
		);
		setTimeout(() => updateStats(performance.now() - start), 0);
	}, [updateStats]);

	const updateSingleItem = useCallback(() => {
		const start = performance.now();
		setItems((prev) => {
			if (prev.length === 0) return prev;
			const index = Math.floor(Math.random() * prev.length);
			return prev.map((item, i) =>
				i === index ? { ...item, text: generateLorem(20) } : item,
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
		const maxCycles = 50;

		intervalRef.current = setInterval(() => {
			// Stop if we've reached max cycles or max items
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
						id: nextIdRef.current++,
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
			<h1>React Benchmark</h1>

			<div style={{ marginBottom: "20px" }}>
				<div>Item count: {items.length} / {MAX_ITEMS} (max)</div>
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
				<Button title="Add 10 Items" variant="primary" onClick={addItems} />
				<Button title="Remove 10 Items" variant="secondary" onClick={removeItems} />
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
