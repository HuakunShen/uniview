import type { TerminalDriver } from "./terminal-driver";

/** The teardown surface a restore guard needs — just `stop()`. */
export type Restorable = Pick<TerminalDriver, "stop">;

/**
 * Run `fn`; if it throws, restore the terminal (`driver.stop()` leaves raw mode
 * and writes the leave sequence) before rethrowing. `stop()` is idempotent, so a
 * later normal teardown is harmless. The core "an unhandled render error always
 * restores the terminal" path.
 */
export function withTerminalRestore<T>(driver: Restorable, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    driver.stop();
    throw error;
  }
}

/** Async variant of {@link withTerminalRestore}. */
export async function withTerminalRestoreAsync<T>(
  driver: Restorable,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    driver.stop();
    throw error;
  }
}

/** The subset of Node's `process` the crash guard needs (injectable for tests). */
export interface ProcessLike {
  on(event: "uncaughtException" | "unhandledRejection", listener: (error: unknown) => void): void;
  off(event: "uncaughtException" | "unhandledRejection", listener: (error: unknown) => void): void;
}

/**
 * Install process-level guards so a crash *outside* React/Solid's own flow still
 * restores the terminal. On `uncaughtException`/`unhandledRejection` it runs
 * `teardown()` then rethrows (keeping the crash visible to Node's default
 * reporter). Returns an uninstall function. `proc` defaults to Node's `process`.
 */
export function installCrashGuard(teardown: () => void, proc: ProcessLike = process): () => void {
  const onCrash = (error: unknown): void => {
    teardown();
    throw error;
  };
  proc.on("uncaughtException", onCrash);
  proc.on("unhandledRejection", onCrash);
  return () => {
    proc.off("uncaughtException", onCrash);
    proc.off("unhandledRejection", onCrash);
  };
}
