import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const projectUrl = new URL('../', import.meta.url);
const slides = await readFile(new URL('slides.md', projectUrl), 'utf8');

test('contains the 18-slide Uniview narrative', () => {
  const slideIds = slides.match(/<!-- slide:\d{2} -->/g) ?? [];
  assert.equal(slideIds.length, 18);

  for (const claim of [
    'Write once. Render anywhere.',
    'UINode',
    'Mutation',
    'Web Worker',
    'AppKit',
    'Prime Directive',
    'One tree. Every surface.',
  ])
    assert.match(slides, new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  assert.doesNotMatch(slides, /Welcome to Slidev/);
  assert.doesNotMatch(slides, /one typed API · another runtime/i);
});

test('uses progressive developer-teaching features', () => {
  assert.match(slides, /twoslash/);
  assert.match(slides, /magic-move/);
  assert.match(slides, /v-mark\.(?:circle|underline|box)/);
  assert.match(slides, /\[click\]/);
  assert.match(slides, /```mermaid/);
  assert.match(slides, /v-motion/);
});

test('grounds the architecture and proof in current Uniview capabilities', () => {
  for (const term of [
    'React', 'Solid', 'Svelte', 'Vue', 'Terminal', 'WebSocket bridge',
    'handler ID', 'incremental', 'htop', '2048', 'lazygit',
  ])
    assert.match(slides, new RegExp(term, 'i'));

  assert.match(slides, /functions never cross RPC/i);
  assert.match(slides, /real frames, not mockups/i);
});

test('does not render Vue markup as indented Markdown code after a fence', () => {
  assert.doesNotMatch(slides, /```\n\n {4,}<[^>]+>/);
});

test('defines typed progressive-visual component interfaces', async () => {
  const expected = new Map([
    ['DeckFrame.vue', []],
    ['FocusRing.vue', ['at', 'x', 'y', 'width', 'height']],
    ['UniversalPipeline.vue', ['step']],
    ['TargetTriptych.vue', ['active']],
    ['RuntimeModes.vue', ['active']],
    ['HandlerJourney.vue', ['step']],
    ['ProofGallery.vue', ['active']],
    ['PrimeDirective.vue', ['active']],
  ]);

  for (const [file, props] of expected) {
    const source = await readFile(new URL(`components/${file}`, projectUrl), 'utf8');
    assert.match(source, /<script setup lang="ts">/, `${file} must use typed script setup`);
    for (const prop of props)
      assert.match(source, new RegExp(`\\b${prop}\\b`), `${file} must expose ${prop}`);
  }
});

test('ships authentic renderer snapshots', async () => {
  for (const file of [
    'htop-react.svg',
    'lazygit-react.svg',
    'charts-react.svg',
    '2048-solid.svg',
    'scope-react.svg',
    'image-react.svg',
  ]) {
    const svg = await readFile(new URL(`public/tui/${file}`, projectUrl), 'utf8');
    assert.match(svg, /<svg\b/);
  }
});
