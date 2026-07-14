/**
 * Wait for React's asynchronous render to commit.
 *
 * The reconciler schedules its work as macrotasks, so the way to let it finish is
 * to *yield the queue* — not to sleep for a fixed number of milliseconds and hope.
 * A bare `setTimeout(resolve, 30)` is a bet on wall-clock that loses as soon as the
 * machine is busy: under a full `turbo run test`, with dozens of suites running at
 * once, the timer fires before React's callbacks get scheduled, the tree is still
 * empty, and the assertion dies on a null root. Every suite here used to make that
 * bet, and the whole package went red under load while passing on its own.
 *
 * Draining the queue a fixed number of times is robust regardless of how busy the
 * box is. The `ms` floor is kept so callers that deliberately wait out a timer
 * (Suspense) behave as before.
 */
export async function flush(ms = 30): Promise<void> {
  const deadline = Date.now() + ms;
  for (let i = 0; i < 25; i += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
}
