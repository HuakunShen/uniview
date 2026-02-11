<script setup lang="ts">
import { computed, h, type VNode, type Component as VueComponent } from "vue";
import type { UINode, JSONValue } from "@uniview/protocol";
import {
  LAYOUT_TAGS,
  isHandlerIdProp,
  extractEventName,
} from "@uniview/protocol";
import { usePluginContext } from "./usePluginContext";

interface Props {
  node: UINode | string;
}

const props = defineProps<Props>();
const { controller, registry } = usePluginContext();

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
  onKeydown?: EventHandler;
  onKeyup?: EventHandler;
  onMouseenter?: EventHandler;
  onMouseleave?: EventHandler;
}

function createHandler(handlerId: string): EventHandler {
  return async (...args: unknown[]) => {
    await controller.executeHandler(handlerId, args as JSONValue[]);
  };
}

function transformProps(
  nodeProps: Record<string, JSONValue>,
): TransformedProps {
  const attrs: Record<string, unknown> = {};
  const result: TransformedProps = { attrs };

  for (const [key, value] of Object.entries(nodeProps)) {
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
          result.onKeydown = handler;
        } else if (eventName === "onKeyUp") {
          result.onKeyup = handler;
        } else if (eventName === "onMouseEnter") {
          result.onMouseenter = handler;
        } else if (eventName === "onMouseLeave") {
          result.onMouseleave = handler;
        }
      }
      continue;
    }

    if (key === "className") {
      attrs.class = value;
    } else if (key === "htmlFor") {
      attrs.for = value;
    } else {
      attrs[key] = value;
    }
  }

  return result;
}

function renderNode(node: UINode | string): VNode | string {
  if (typeof node === "string") {
    return node;
  }

  const { type, props: nodeProps, children } = node;
  const p = transformProps(nodeProps);

  const renderChildren = (): VNode[] =>
    children.map((child, index) => {
      const rendered = renderNode(child);
      return typeof rendered === "string"
        ? h("span", { key: index }, rendered)
        : rendered;
    });

  if (type === "button") {
    return h(
      "button",
      {
        class: `cursor-pointer ${p.attrs.class || ""}`,
        ...p.attrs,
        onClick: p.onClick,
      },
      renderChildren(),
    );
  }

  if (type === "input") {
    return h("input", {
      ...p.attrs,
      onInput: p.onInput,
      onChange: p.onChange,
    });
  }

  if (type === "textarea") {
    return h("textarea", {
      ...p.attrs,
      onInput: p.onInput,
      onChange: p.onChange,
    });
  }

  if (type === "select") {
    return h("select", { ...p.attrs, onChange: p.onChange }, renderChildren());
  }

  if (type === "a") {
    return h("a", { ...p.attrs, onClick: p.onClick }, renderChildren());
  }

  if (type === "form") {
    return h("form", { ...p.attrs, onSubmit: p.onSubmit }, renderChildren());
  }

  if (LAYOUT_TAGS.includes(type as (typeof LAYOUT_TAGS)[number])) {
    const isVoidElement = VOID_ELEMENTS.includes(type);
    if (isVoidElement) {
      return h(type, p.attrs);
    }
    return h(type, p.attrs, renderChildren());
  }

  if (registry?.has(type)) {
    const RegisteredComponent = registry.get(type) as VueComponent;
    const textChildren = children
      .filter((child): child is string => typeof child === "string")
      .join("");
    const nonTextChildren = children.filter(
      (child) => typeof child !== "string",
    ) as UINode[];

    const componentProps = {
      ...p.attrs,
      title: textChildren || p.attrs.title,
      onClick: p.onClick,
      onInput: p.onInput,
      onChange: p.onChange,
      onSubmit: p.onSubmit,
      onFocus: p.onFocus,
      onBlur: p.onBlur,
      onKeydown: p.onKeydown,
      onKeyup: p.onKeyup,
    };

    if (nonTextChildren.length > 0 || textChildren) {
      return h(RegisteredComponent, componentProps, {
        default: () => [
          textChildren,
          ...nonTextChildren.map((child, index) => {
            const rendered = renderNode(child);
            return typeof rendered === "string"
              ? h("span", { key: index }, rendered)
              : rendered;
          }),
        ],
      });
    }

    return h(RegisteredComponent, componentProps);
  }

  return h("div", { class: "uniview-unknown" }, `Unknown: ${type}`);
}

const renderedNode = computed((): VNode => {
  const result = renderNode(props.node);
  return typeof result === "string" ? h("span", {}, result) : result;
});
</script>

<template>
  <component :is="renderedNode" />
</template>
