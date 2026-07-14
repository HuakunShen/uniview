import { describe, expect, it, vi } from "vitest";
import { GitWorkspaceModel } from "../src/model";

describe("GitWorkspaceModel", () => {
  it("starts on a clean branch with no changes", () => {
    const m = new GitWorkspaceModel();
    expect(m.getState()).toMatchObject({ branch: "main", files: [], statusLine: "No changes" });
  });

  it("refresh loads the working tree", () => {
    const m = new GitWorkspaceModel();
    m.refresh();
    const s = m.getState();
    expect(s.files.length).toBeGreaterThan(0);
    expect(s.files.every((f) => f.status === "unstaged")).toBe(true);
    expect(s.statusLine).toMatch(/change/i);
  });

  it("stage moves a file to the index", () => {
    const m = new GitWorkspaceModel();
    m.refresh();
    const first = m.getState().files[0]!.path;
    m.stage(first);
    expect(m.getState().files.find((f) => f.path === first)?.status).toBe("staged");
    expect(m.getState().statusLine).toMatch(/staged/i);
  });

  it("commit clears staged files and reports the message", () => {
    const m = new GitWorkspaceModel();
    m.refresh();
    const path = m.getState().files[0]!.path;
    m.stage(path);
    m.commit("initial");
    expect(m.getState().files.find((f) => f.path === path)).toBeUndefined();
    expect(m.getState().statusLine).toMatch(/initial/);
  });

  it("notifies subscribers on every change", () => {
    const m = new GitWorkspaceModel();
    const cb = vi.fn();
    m.subscribe(cb);
    m.refresh();
    m.stage(m.getState().files[0]!.path);
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
