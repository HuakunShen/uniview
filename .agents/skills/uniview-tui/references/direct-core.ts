import { createTuiApp, type RenderNode } from "@uniview/tui-core"

function view(count: number): RenderNode {
	return {
		type: "box",
		style: { flexDirection: "column", padding: 1, border: "rounded", width: 40 },
		children: [
			{
				type: "text",
				text: "Uniview tui-core demo",
				textStyle: { fg: "cyan", bold: true },
			},
			{ type: "text", text: "" },
			{ type: "text", text: `Count: ${count}`, textStyle: { bold: true } },
			{ type: "text", text: "" },
			{
				type: "text",
				text: "[+] increment  [-] decrement  [q] quit",
				textStyle: { fg: "gray", dim: true },
			},
		],
	}
}

const app = createTuiApp({ input: process.stdin, output: process.stdout })
let count = 0

app.render(view(count))

function quit(): void {
	app.destroy()
	process.exit(0)
}

app.onInput((event) => {
	if (event.type === "text" && event.text === "+") {
		count += 1
		app.render(view(count))
	} else if (event.type === "text" && event.text === "-") {
		count -= 1
		app.render(view(count))
	} else if (
		(event.type === "text" && event.text === "q") ||
		(event.type === "key" && event.key === "c" && event.ctrl)
	) {
		quit()
	}
})

process.stdin.on?.("end", quit)
