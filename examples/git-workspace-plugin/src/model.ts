export type FileStatus = "unstaged" | "staged";

export interface GitFile {
  path: string;
  status: FileStatus;
}

export interface GitWorkspaceState {
  branch: string;
  files: GitFile[];
  statusLine: string;
}

const SAMPLE_FILES = ["README.md", "src/index.ts", "package.json"];

/**
 * A framework-neutral model of a Git working tree. It carries the shared
 * business state and commands; the same model can back a TUI, Web or native
 * view (the plan's shared-logic axis). No real git — it simulates a working
 * tree so the flagship demo stays hermetic and testable.
 */
export class GitWorkspaceModel {
  private state: GitWorkspaceState = {
    branch: "main",
    files: [],
    statusLine: "No changes",
  };
  private readonly subscribers = new Set<() => void>();

  getState(): GitWorkspaceState {
    return this.state;
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  refresh(): void {
    this.state = {
      ...this.state,
      files: SAMPLE_FILES.map((path) => ({ path, status: "unstaged" as const })),
    };
    this.state.statusLine = `${this.state.files.length} change${this.state.files.length === 1 ? "" : "s"}`;
    this.notify();
  }

  stage(path: string): void {
    this.state = {
      ...this.state,
      files: this.state.files.map((f) =>
        f.path === path ? { ...f, status: "staged" as const } : f,
      ),
    };
    const staged = this.state.files.filter((f) => f.status === "staged").length;
    this.state.statusLine = `${staged} staged`;
    this.notify();
  }

  unstage(path: string): void {
    this.state = {
      ...this.state,
      files: this.state.files.map((f) =>
        f.path === path ? { ...f, status: "unstaged" as const } : f,
      ),
    };
    this.notify();
  }

  commit(message: string): void {
    this.state = {
      ...this.state,
      files: this.state.files.filter((f) => f.status !== "staged"),
      statusLine: `Committed: ${message}`,
    };
    this.notify();
  }

  private notify(): void {
    for (const cb of this.subscribers) cb();
  }
}
