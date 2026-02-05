import { createElement, Fragment } from "react";
import type { ReactElement, ReactNode } from "react";

export interface BoxProps {
  children?: ReactNode;
  flexDirection?: "row" | "column";
  padding?: number;
  gap?: number;
  width?: number;
  height?: number;
  color?:
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white"
    | "gray";
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

export function Box({ children, ...props }: BoxProps): ReactElement {
  return createElement("Box", props, children);
}

export interface TextProps {
  children?: ReactNode;
  color?:
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white"
    | "gray";
  bold?: boolean;
  dim?: boolean;
  inverse?: boolean;
}

export function Text({ children, ...props }: TextProps): ReactElement {
  return createElement("Text", props, children);
}

export interface ButtonProps {
  children?: ReactNode;
  title?: string;
  onPress?: () => void;
  disabled?: boolean;
}

export function Button({ children, ...props }: ButtonProps): ReactElement {
  return createElement("Button", props, children);
}

export interface InputProps {
  value?: string;
  placeholder?: string;
  width?: number;
  onChange?: (value: string) => void;
}

export function Input(props: InputProps): ReactElement {
  return createElement("Input", props);
}

export interface NewlineProps {
  count?: number;
}

export function Newline({ count = 1 }: NewlineProps): ReactElement {
  const lines = Array.from({ length: count }, () => createElement("Newline"));
  return createElement(Fragment, null, ...lines);
}
