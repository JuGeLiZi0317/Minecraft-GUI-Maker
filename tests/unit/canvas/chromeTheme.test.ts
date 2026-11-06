import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANVAS_CHROME, type CanvasChromeTheme } from '../../../src/canvas/chromeTheme';

const tokensPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'src', 'styles', 'tokens.css');
const source = readFileSync(tokensPath, 'utf8');

const block = (marker: string): Record<string, string> => {
  const start = source.indexOf(marker);
  expect(start, `tokens.css must contain ${marker}`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const body = source.slice(open + 1, close);
  const values: Record<string, string> = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) values[match[1]] = match[2].trim();
  return values;
};

const dark = block(':root {');
const light = block(':root[data-theme="light"] {');

const resolve = (values: Record<string, string>, raw: string): string => {
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(raw);
  return alias ? values[alias[1]] : raw;
};

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');

/** Palette key → semantic CSS token in tokens.css (single source of truth for values). */
const MAP: [keyof CanvasChromeTheme, string][] = [
  ['accent', '--canvas-accent'],
  ['accentInk', '--canvas-accent-ink'],
  ['selectionOutline', '--canvas-selection-outline'],
  ['alignGuide', '--canvas-align-guide'],
  ['spacingLine', '--canvas-spacing-line'],
  ['spacingText', '--canvas-spacing-text'],
  ['grid', '--canvas-grid'],
  ['panelGrid', '--canvas-grid-panel'],
  ['rulerBg', '--canvas-ruler'],
  ['rulerLine', '--canvas-ruler-line'],
  ['rulerText', '--canvas-ruler-text'],
  ['rulerTick', '--canvas-ruler-tick'],
  ['tabActive', '--canvas-tab-active'],
  ['tabIdle', '--canvas-tab-idle'],
  ['tabText', '--canvas-tab-text'],
  ['scrollTrack', '--canvas-scroll-track'],
  ['scrollThumb', '--canvas-scroll-thumb'],
  ['previewFrame', '--canvas-preview-frame'],
  ['previewFrameLine', '--canvas-preview-frame-line'],
  ['diagWarn', '--canvas-diag-warn'],
  ['diagBadBg', '--canvas-diag-bad-bg'],
  ['diagBadText', '--canvas-diag-bad-text'],
  ['chipBg', '--canvas-chip-bg'],
  ['chipLine', '--canvas-chip-line'],
  ['chipText', '--canvas-chip-text'],
];

describe('canvas chrome palette stays in sync with CSS tokens', () => {
  it('dark palette equals :root tokens', () => {
    for (const [key, token] of MAP) {
      expect(normalize(CANVAS_CHROME.dark[key]), `${key} vs ${token}`).toBe(normalize(resolve(dark, dark[token] ?? '')));
    }
  });
  it('light palette equals :root[data-theme="light"] tokens', () => {
    for (const [key, token] of MAP) {
      expect(normalize(CANVAS_CHROME.light[key]), `${key} vs ${token}`).toBe(normalize(resolve(light, light[token] ?? '')));
    }
  });
  it('chrome accent tokens alias the shared accent tokens', () => {
    expect(dark['--canvas-accent']).toBe('var(--accent)');
    expect(light['--canvas-accent']).toBe('var(--accent)');
    expect(dark['--canvas-accent-ink']).toBe('var(--accent-ink)');
    expect(light['--canvas-accent-ink']).toBe('var(--accent-ink)');
  });
  it('design-surface matte is theme-independent and matches the WYSIWYG contract', () => {
    expect(normalize(dark['--canvas-design'])).toBe('#1c2634');
    expect(normalize(light['--canvas-design'])).toBe('#1c2634');
  });
});
