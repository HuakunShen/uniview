# @uniview/host-svelte

Svelte 5 adapter for hosting Uniview plugins.

## Installation

```bash
pnpm add @uniview/host-svelte @uniview/host-sdk @uniview/protocol
```

## Overview

This package provides Svelte 5 components for rendering Uniview plugin UI trees. It uses Svelte 5 runes syntax and the `use:action` pattern for event binding.

## Quick Start

```svelte
<script lang="ts">
  import { PluginHost } from '@uniview/host-svelte';
  import { createWorkerController, createComponentRegistry } from '@uniview/host-sdk';
  import Button from '$lib/components/Button.svelte';

  // Create component registry
  const registry = createComponentRegistry();
  registry.register('Button', Button);

  // Create plugin controller
  const controller = createWorkerController({
    pluginUrl: '/plugins/my-plugin.js'
  });
</script>

<PluginHost {controller} {registry}>
  <p slot="loading">Loading plugin...</p>
</PluginHost>
```

## Components

### PluginHost

Main component that manages plugin lifecycle and renders the UI tree:

```svelte
<script lang="ts">
  import { PluginHost } from '@uniview/host-svelte';
  import type { PluginController, ComponentRegistry } from '@uniview/host-sdk';

  interface Props {
    controller: PluginController;
    registry: ComponentRegistry;
  }

  let { controller, registry }: Props = $props();
</script>

<PluginHost {controller} {registry}>
  <!-- Optional: custom loading slot -->
  <div slot="loading">Loading...</div>
</PluginHost>
```

**Props:**

- `controller`: A `PluginController` instance from `@uniview/host-sdk`
- `registry`: A `ComponentRegistry` for custom component lookup

**Slots:**

- `loading`: Shown while waiting for first tree update

**Lifecycle:**

- Connects on mount
- Subscribes to tree updates
- Disconnects on destroy

### ComponentRenderer

Low-level component for rendering a single UINode. Used internally by PluginHost, but can be used directly for custom rendering:

```svelte
<script lang="ts">
  import { ComponentRenderer } from '@uniview/host-svelte';
  import type { UINode } from '@uniview/protocol';

  let { node }: { node: UINode | string } = $props();
</script>

<ComponentRenderer {node} />
```

**Requires Context:**

- `uniview:controller`: PluginController instance
- `uniview:registry`: ComponentRegistry instance

## Custom Components

Register your Svelte components to map plugin types:

```svelte
<!-- Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
    onclick?: () => void;
    children?: Snippet;
  }

  let { variant = 'primary', disabled = false, onclick, children }: Props = $props();
</script>

<button class="btn btn-{variant}" {disabled} {onclick}>
  {@render children?.()}
</button>
```

```typescript
// In your host
const registry = createComponentRegistry();
registry.register("Button", Button);
```

Now when a plugin renders `<button>`, it will use your custom Button component.

## Event Handling

Events are automatically proxied from the plugin to your components:

1. Plugin defines an event handler: `onClick={() => setCount(c => c + 1)}`
2. Renderer extracts handler ID from props: `_onClickHandlerId`
3. ComponentRenderer creates a proxy function that calls `controller.execute(handlerId, args)`
4. Your component receives a normal `onclick` prop

This happens transparently - your components just receive normal event handlers.

## Layout Tags

These HTML-like elements are rendered as native Svelte elements:

```
div, span, p, section, header, footer, ul, ol, li, br, hr,
h1, h2, h3, h4, h5, h6, button, input, form, label
```

## Full Example

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { PluginHost } from '@uniview/host-svelte';
  import { createWorkerController, createComponentRegistry } from '@uniview/host-sdk';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';

  const registry = createComponentRegistry();
  registry.register('Button', Button);
  registry.register('Card', Card);

  const controller = createWorkerController({
    pluginUrl: '/plugins/dashboard.js',
    initialProps: { theme: 'dark' }
  });

  // Update props dynamically
  function setTheme(theme: string) {
    controller.updateProps({ theme });
  }
</script>

<main>
  <h1>Dashboard</h1>

  <div class="controls">
    <button onclick={() => setTheme('light')}>Light</button>
    <button onclick={() => setTheme('dark')}>Dark</button>
  </div>

  <PluginHost {controller} {registry}>
    <div slot="loading" class="spinner">Loading plugin...</div>
  </PluginHost>
</main>
```
