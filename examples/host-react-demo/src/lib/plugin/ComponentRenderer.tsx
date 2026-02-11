import React from "react";
import type { UINode, JSONValue } from "@uniview/protocol";
import {
  LAYOUT_TAGS,
  isHandlerIdProp,
  extractEventName,
} from "@uniview/protocol";
import { usePluginContext } from "./PluginContext";

interface ComponentRendererProps {
  node: UINode | string;
}

const VOID_ELEMENTS = ["br", "hr", "img", "input", "meta", "link"];

type EventHandler = (...args: unknown[]) => Promise<void>;

interface TransformedProps {
  attrs: Record<string, unknown>;
  onClick?: EventHandler;
  onInput?: EventHandler;
  onChange?: EventHandler;
  onSubmit?: EventHandler;
  onFocus?: EventHandler;
  onBlur?: EventHandler;
  onKeyDown?: EventHandler;
  onKeyUp?: EventHandler;
  onMouseEnter?: EventHandler;
  onMouseLeave?: EventHandler;
}

export function ComponentRenderer({ node }: ComponentRendererProps) {
  const { controller, registry } = usePluginContext();

  if (typeof node === "string") {
    return <>{node}</>;
  }

  function createHandler(handlerId: string): EventHandler {
    return async (...args: unknown[]) => {
      await controller.executeHandler(handlerId, args as JSONValue[]);
    };
  }

  function transformProps(props: Record<string, JSONValue>): TransformedProps {
    const attrs: Record<string, unknown> = {};
    const result: TransformedProps = { attrs };

    for (const [key, value] of Object.entries(props)) {
      if (key === "children" || key === "key") continue;

      if (isHandlerIdProp(key)) {
        const eventName = extractEventName(key);
        if (eventName && typeof value === "string") {
          const handler = createHandler(value);
          if (eventName === "onChange") {
            result.onInput = handler;
            result.onChange = handler;
          } else if (eventName === "onInput") {
            result.onInput = handler;
          } else if (eventName === "onClick") {
            result.onClick = handler;
          } else if (eventName === "onSubmit") {
            result.onSubmit = handler;
          } else if (eventName === "onFocus") {
            result.onFocus = handler;
          } else if (eventName === "onBlur") {
            result.onBlur = handler;
          } else if (eventName === "onKeyDown") {
            result.onKeyDown = handler;
          } else if (eventName === "onKeyUp") {
            result.onKeyUp = handler;
          } else if (eventName === "onMouseEnter") {
            result.onMouseEnter = handler;
          } else if (eventName === "onMouseLeave") {
            result.onMouseLeave = handler;
          }
        }
        continue;
      }

      if (key === "className") {
        attrs.className = value;
      } else if (key === "htmlFor") {
        attrs.htmlFor = value;
      } else {
        attrs[key] = value;
      }
    }

    return result;
  }

  const { type, props, children } = node;
  const p = transformProps(props);

  if (type === "button") {
    return (
      <button
        className={`cursor-pointer ${p.attrs.className || ""}`}
        {...p.attrs}
        onClick={p.onClick}
      >
        {children.map((child, index) => (
          <ComponentRenderer key={index} node={child} />
        ))}
      </button>
    );
  }

  if (type === "input") {
    return <input {...p.attrs} onInput={p.onInput} onChange={p.onChange} />;
  }

  if (type === "textarea") {
    return <textarea {...p.attrs} onInput={p.onInput} onChange={p.onChange} />;
  }

  if (type === "select") {
    return (
      <select {...p.attrs} onChange={p.onChange}>
        {children.map((child, index) => (
          <ComponentRenderer key={index} node={child} />
        ))}
      </select>
    );
  }

  if (type === "a") {
    return (
      <a {...p.attrs} onClick={p.onClick}>
        {children.map((child, index) => (
          <ComponentRenderer key={index} node={child} />
        ))}
      </a>
    );
  }

  if (type === "form") {
    return (
      <form {...p.attrs} onSubmit={p.onSubmit}>
        {children.map((child, index) => (
          <ComponentRenderer key={index} node={child} />
        ))}
      </form>
    );
  }

  if (LAYOUT_TAGS.includes(type as (typeof LAYOUT_TAGS)[number])) {
    const Tag = type as keyof React.JSX.IntrinsicElements;
    const isVoidElement = VOID_ELEMENTS.includes(type);

    if (isVoidElement) {
      return React.createElement(
        Tag,
        p.attrs as React.HTMLAttributes<HTMLElement>,
      );
    }

    return React.createElement(
      Tag,
      p.attrs as React.HTMLAttributes<HTMLElement>,
      children.map((child, index) => (
        <ComponentRenderer key={index} node={child} />
      )),
    );
  }

  if (registry?.has(type)) {
    const RegisteredComponent = registry.get(type)!;
    const textChildren = children
      .filter((child): child is string => typeof child === "string")
      .join("");
    const nonTextChildren = children.filter(
      (child) => typeof child !== "string",
    );

    const componentProps: Record<string, unknown> = {
      ...p.attrs,
      title: textChildren || p.attrs.title,
      onClick: p.onClick,
      onInput: p.onInput,
      onChange: p.onChange,
      onSubmit: p.onSubmit,
      onFocus: p.onFocus,
      onBlur: p.onBlur,
      onKeyDown: p.onKeyDown,
      onKeyUp: p.onKeyUp,
    };

    if (nonTextChildren.length > 0 || textChildren) {
      return React.createElement(
        RegisteredComponent,
        componentProps,
        textChildren,
        ...nonTextChildren.map((child, index) => (
          <ComponentRenderer key={index} node={child} />
        )),
      );
    }

    return React.createElement(RegisteredComponent, componentProps);
  }

  return <div className="uniview-unknown">Unknown: {type}</div>;
}
