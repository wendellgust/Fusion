import { BaseDirectory, readTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';

import {
  applyAdvancedTheme,
  parseAdvancedTheme,
  setThemeId,
} from '@nuclearplayer/themes';

import { useThemeStore, type AdvancedTheme } from '../stores/themeStore';

const isWebEnv = () => typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__;

export const loadAndApplyThemeFile = async (path: string): Promise<void> => {
  try {
    if (!isWebEnv()) {
      const contents = await readTextFile(path, { baseDir: BaseDirectory.AppData });
      const json = JSON.parse(contents);
      const theme = parseAdvancedTheme(json);
      setThemeId('');
      applyAdvancedTheme(theme);
    }
  } catch (error) {
    console.warn('Could not read theme file via Tauri FS:', error);
  }
};

export const loadAndApplyAdvancedThemeFromFile = async (
  path: string,
): Promise<void> => {
  await loadAndApplyThemeFile(path);
  await useThemeStore.getState().selectAdvancedTheme(path);
};

export const loadAndApplyMarketplaceTheme = async (
  id: string,
): Promise<void> => {
  try {
    let applied = false;

    // 1. Fetch theme JSON directly from CDN registry for web browser mode
    try {
      const res = await fetch(`https://cdn.jsdelivr.net/gh/NuclearPlayer/theme-registry@master/themes/${id}.json`);
      if (res.ok) {
        const json = await res.json();
        const theme = parseAdvancedTheme(json);
        setThemeId('');
        applyAdvancedTheme(theme);
        applied = true;
      }
    } catch {
      /* ignore CDN error and try Tauri FS */
    }

    if (!applied && !isWebEnv()) {
      try {
        await loadAndApplyThemeFile(`themes/store/${id}.json`);
        applied = true;
      } catch {
        /* ignore */
      }
    }

    if (!applied) {
      setThemeId(id);
    }

    await useThemeStore.getState().selectMarketplaceTheme(id);
    toast.success('Theme applied!');
  } catch (error) {
    setThemeId(id);
    await useThemeStore.getState().selectMarketplaceTheme(id);
  }
};

export const applyAdvancedThemeFromSettingsIfAny = async (): Promise<void> => {
  const { activeTheme, isAdvancedThemeSelected } = useThemeStore.getState();
  if (!isAdvancedThemeSelected()) {
    return;
  }

  const { path } = activeTheme as AdvancedTheme;

  try {
    setThemeId('');
    await loadAndApplyAdvancedThemeFromFile(path);
  } catch (error) {
    toast.error("Couldn't load advanced theme", {
      description: error instanceof Error ? error.message : String(error),
    });
  }
};
