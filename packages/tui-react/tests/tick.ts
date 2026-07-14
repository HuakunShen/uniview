/**
 * Wait for a render to reach the surface.
 *
 * React commits asynchronously and the host schedules its frame, so a test has to
 * wait — but it must wait for the *work*, not for the clock. A bare
 * `setTimeout(20)` is a bet that the machine is idle, and it loses under a full
 * parallel `turbo run test`: the timer fires before the render callbacks get
 * scheduled, the surface is still blank, and the assertion fails somewhere that
 * has nothing to do with the bug.
 *
 * Draining the macrotask queue a fixed number of times is robust however busy the
 * box is.
 */
export async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
