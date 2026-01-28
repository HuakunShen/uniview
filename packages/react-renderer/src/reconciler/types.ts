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
}
