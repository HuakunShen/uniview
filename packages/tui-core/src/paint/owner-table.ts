/**
 * Interns node ids into small integers stored per cell as `ownerId`, forming
 * the hit-testing source: a pointer position maps to a cell, the cell's owner
 * maps back to the node that painted it. Owner 0 means "no owner".
 */
export class OwnerTable {
  private readonly ids: (string | undefined)[] = [undefined];
  private readonly lookup = new Map<string, number>();

  /** Number of interned owners, including the reserved "none" slot. */
  get size(): number {
    return this.ids.length;
  }

  /** Intern a node id, returning its stable non-zero owner number. */
  intern(id: string): number {
    const existing = this.lookup.get(id);
    if (existing !== undefined) return existing;
    const owner = this.ids.length;
    this.ids.push(id);
    this.lookup.set(id, owner);
    return owner;
  }

  /** Resolve an owner number back to its node id (or undefined). */
  idOf(owner: number): string | undefined {
    return this.ids[owner];
  }
}
