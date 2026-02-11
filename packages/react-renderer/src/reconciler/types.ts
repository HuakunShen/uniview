export interface InternalNode {
  type: string;
  props: Record<string, unknown>;
  children: (InternalNode | TextNode)[];
  id: string;
  parent: InternalNode | null;
}

export interface TextNode {
  _isTextNode: true;
  text: string;
  id: string; // Stable ID for mutation-based updates
  parent: InternalNode | null; // Parent reference for mutations
}
