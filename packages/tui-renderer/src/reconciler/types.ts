export interface TuiNode {
  type: string;
  props: Record<string, unknown>;
  children: (TuiNode | TextNode)[];
  id: string;
  parent: TuiNode | null;
}

export interface TextNode {
  _isTextNode: true;
  text: string;
}

export interface TuiContainer {
  rootInstance: TuiNode | null;
  update: () => void;
}
