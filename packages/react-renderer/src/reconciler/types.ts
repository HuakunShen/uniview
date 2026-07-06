export interface InternalNode {
  type: string;
  props: Record<string, unknown>;
  children: (InternalNode | TextNode)[];
  id: string;
  parent: InternalNode | null;
  /** Suspense visibility — hidden nodes stay mounted but are not serialized */
  hidden?: boolean;
}

export interface TextNode {
  _isTextNode: true;
  text: string;
  id: string; // Stable ID for mutation-based updates
  parent: InternalNode | null; // Parent reference for mutations
  /** Suspense visibility — hidden nodes stay mounted but are not serialized */
  hidden?: boolean;
}
