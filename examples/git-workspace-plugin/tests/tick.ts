/**
 * Wait for the plugin's render to reach the host.
 *
 * Waits for the *work* rather than the clock: a bare `setTimeout(25)` is a bet
 * that the machine is idle, and it loses under a full parallel `turbo run test`
 * — the timer fires before the render callbacks are scheduled and the assertion
 * fails for reasons unrelated to the code under test. Draining the macrotask
 * queue a fixed number of times is robust however busy the box is.
 */
export async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
