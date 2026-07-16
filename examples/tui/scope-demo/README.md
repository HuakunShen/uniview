# @uniview/tui-scope-demo

A terminal **audio scope** — three `Tab`-cycled full-screen modes drawn on a
braille `<Canvas>`, modelled on ratatui [`scope-tui`](https://github.com/alemidev/scope-tui).

```bash
pnpm --filter @uniview/tui-scope-demo dev
```

Keys: `Tab` / `Shift-Tab` cycle modes · `1` `2` `3` jump to a mode · `q` or
`Ctrl-C` quit.

| Mode | What it draws |
|---|---|
| **Oscilloscope** | L/R waveform vs. time, rising-edge triggered so a steady tone holds still |
| **Vectorscope** | (L, R) plotted as an X/Y Lissajous phase figure + a phase-correlation readout |
| **Spectroscope** | FFT magnitude in dBFS vs. log-frequency, with 100 Hz / 1 kHz / 10 kHz gridlines |

## How it works

Everything visual is a braille `<Canvas>` (2×4 dots per cell) — the direct analog
of scope-tui's ratatui `Chart` with a braille `Marker`. Each mode is a pure
`(DrawContext, StereoFrame) → void` plus the data-space bounds `<Canvas>`
projects with (`src/scopes.ts`), mirroring scope-tui's `DisplayMode`
process/axis split. **No new renderer primitive** — the Canvas emits the same
styled-lines tree as the charts.

The frame loop is `useAnimation()` over the host `FrameClock`: every frame
regenerates the signal at the current clock time and repaints locally — no
per-frame RPC, exactly as uniview's PRIME DIRECTIVE requires for high-frequency
redraw.

### The signal is synthetic

`src/signal.ts` is pure, deterministic DSP so the demo runs in a **sandboxed
Worker with no audio device**:

- `synthFrame(t, n)` — a small additive-synth chord (five panned partials) whose
  L/R phase relationship drifts slowly, so the vectorscope figure rotates and the
  spectroscope shows a few clean peaks. A frame is a pure function of the clock
  time `t`, which is what keeps it testable.
- `fft(re, im)` — a hand-rolled in-place radix-2 Cooley–Tukey FFT (no `fft.js`
  dependency), with `hannWindow` + `magnitudeSpectrum` on top.
- `risingEdge` — the oscilloscope's edge trigger.

The DSP is unit-tested against a naive DFT and known transforms
(`tests/signal.test.ts`).

### Swapping in real audio

A **real** audio source is exactly what the Node/Bun **bridge plugin** exists
for: the sandboxed Worker path can't open an OS audio device, but a bridge plugin
can bind PortAudio (`naudiodon`) — or read a WAV / a raw-PCM pipe — and stream
`StereoFrame`s to this same UI unchanged. The rendering half needs nothing new;
only the data source moves off `synthFrame`.
