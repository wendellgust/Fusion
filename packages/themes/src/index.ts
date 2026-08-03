import {
  generateAdvancedThemeCSS,
  generateAdvancedThemeCSSFromJSON,
} from './advanced/generator';
import {
  AdvancedTheme,
  AdvancedThemeSchema,
  MarketplaceTheme,
  MarketplaceThemeRegistrySchema,
  MarketplaceThemeSchema,
  parseAdvancedTheme,
} from './advanced/schema';
import { BUILTIN_BASIC_THEME_IDS, DEFAULT_THEME_ID } from './basic';

import './basic/aurora.css';
import './basic/ember.css';
import './basic/lagoon.css';
import './basic/arctic-moss.css';
import './basic/plasma.css';
import './basic/matrix.css';

export type BasicThemeMeta = {
  id: string;
  name: string;
  palette: [string, string, string, string];
};

const BUILT_INS: BasicThemeMeta[] = [
  {
    id: DEFAULT_THEME_ID,
    name: 'Default',
    palette: [
      'oklch(0.77 0.17 342)',
      'oklch(0.95 0.02 342)',
      'oklch(0.42 0.10 342)',
      'oklch(0.15 0.02 342)',
    ],
  },
  {
    id: 'nuclear:aurora',
    name: 'Aurora',
    palette: [
      'oklch(0.74 0.15 305)',
      'oklch(0.98 0.01 340)',
      'oklch(0.62 0.11 305)',
      'oklch(0.22 0.03 305)',
    ],
  },
  {
    id: 'nuclear:ember',
    name: 'Ember',
    palette: [
      'oklch(0.76 0.14 30)',
      'oklch(0.97 0.02 70)',
      'oklch(0.64 0.10 30)',
      'oklch(0.22 0.03 20)',
    ],
  },
  {
    id: 'nuclear:lagoon',
    name: 'Lagoon',
    palette: [
      'oklch(0.67 0.16 205)',
      'oklch(0.985 0.018 210)',
      'oklch(0.55 0.12 205)',
      'oklch(0.20 0.025 205)',
    ],
  },
  {
    id: 'nuclear:arctic-moss',
    name: 'Moss',
    palette: [
      'oklch(0.70 0.12 175)',
      'oklch(0.97 0.008 200)',
      'oklch(0.58 0.09 175)',
      'oklch(0.20 0.02 175)',
    ],
  },
  {
    id: 'nuclear:plasma',
    name: 'Plasma',
    palette: [
      'oklch(0.70 0.22 320)',
      'oklch(0.97 0.015 310)',
      'oklch(0.40 0.12 315)',
      'oklch(0.18 0.03 300)',
    ],
  },
  {
    id: 'nuclear:matrix',
    name: 'Matrix',
    palette: [
      'oklch(0.45 0.13 145)',
      'oklch(0.96 0.02 145)',
      'oklch(0.35 0.10 145)',
      'oklch(0.13 0.02 145)',
    ],
  },
];

export function listBasicThemes(): BasicThemeMeta[] {
  const allowed = new Set<string>(BUILTIN_BASIC_THEME_IDS as readonly string[]);
  return BUILT_INS.filter((t) => allowed.has(t.id));
}

export function setThemeId(id: string): void {
  const root = document.documentElement;
  root.setAttribute('data-theme-id', id);
  if (!root.getAttribute('data-theme')) {
    root.setAttribute('data-theme', 'dark');
  }
}

export function setBasicTheme(id: string): void {
  setThemeId(id);
}

const ADV_STYLE_ID = 'advanced-theme';

export function applyAdvancedTheme(theme: AdvancedTheme): void {
  const parsed = AdvancedThemeSchema.parse(theme);
  const css = generateAdvancedThemeCSS(parsed);
  let style = document.getElementById(ADV_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = ADV_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = css;
}

export function clearAdvancedTheme(): void {
  const style = document.getElementById(ADV_STYLE_ID);
  if (style?.parentNode) {
    style.parentNode.removeChild(style);
  }
}

export type { AdvancedTheme, MarketplaceTheme };
export {
  AdvancedThemeSchema,
  BUILTIN_BASIC_THEME_IDS,
  DEFAULT_THEME_ID,
  MarketplaceThemeRegistrySchema,
  MarketplaceThemeSchema,
};
export { parseAdvancedTheme, generateAdvancedThemeCSSFromJSON };
