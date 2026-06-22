import {
  BaseDirectory,
  readTextFile,
  remove,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import { parseAdvancedTheme } from '@nuclearplayer/themes';
import {
  Button,
  Input,
  ScrollableArea,
  SectionShell,
  Select,
} from '@nuclearplayer/ui';

import {
  refreshAdvancedThemeList,
  THEMES_DIR_NAME,
} from '../../services/advancedThemeDirService';
import { loadAndApplyAdvancedThemeFromFile } from '../../services/advancedThemeService';
import { useThemeStore } from '../../stores/themeStore';
import { reportError } from '../../utils/logging';
import { ensureDir } from '../../utils/path';

const COLOR_KEYS = [
  'background',
  'background-secondary',
  'background-input',
  'foreground',
  'foreground-secondary',
  'primary',
  'border',
  'accent-green',
  'accent-yellow',
  'accent-purple',
  'accent-blue',
  'accent-orange',
  'accent-cyan',
  'accent-red',
] as const;

type Vars = Record<string, string>;

const NEW_THEME_TEMPLATE: { vars: Vars; dark: Vars } = {
  vars: {
    background: '#f2f0ec',
    'background-secondary': '#ffffff',
    'background-input': '#ffffff',
    foreground: '#1a1a1a',
    'foreground-secondary': '#4d4a45',
    primary: '#c9a86a',
    border: '#1a1a1a',
  },
  dark: {
    background: '#16140f',
    'background-secondary': '#1f1c15',
    'background-input': '#0e0c09',
    foreground: '#ece7dc',
    'foreground-secondary': '#bfb7a6',
    primary: '#8a6f3c',
    border: '#5a523f',
  },
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'theme';

const isHexColor = (value: string): boolean =>
  /^#[0-9a-fA-F]{6}$/.test(value.trim());

type ColorRowProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const ColorRow = ({ label, value, onChange }: ColorRowProps) => (
  <div className="flex items-center gap-2">
    <input
      type="color"
      aria-label={`${label} color picker`}
      className="border-border h-8 w-10 shrink-0 cursor-pointer rounded border bg-transparent"
      value={isHexColor(value) ? value.trim() : '#000000'}
      onChange={(event) => onChange(event.target.value)}
    />
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="text-foreground-secondary truncate text-xs">
        {label}
      </span>
      <Input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  </div>
);

type VarsSectionProps = {
  title: string;
  vars: Vars;
  onChange: (key: string, value: string) => void;
};

const VarsSection = ({ title, vars, onChange }: VarsSectionProps) => (
  <div className="flex min-w-64 flex-1 flex-col gap-2">
    <h3 className="text-foreground font-semibold">{title}</h3>
    {COLOR_KEYS.map((key) => (
      <ColorRow
        key={key}
        label={key}
        value={vars[key] ?? ''}
        onChange={(value) => onChange(key, value)}
      />
    ))}
  </div>
);

const stripEmpty = (vars: Vars): Vars =>
  Object.fromEntries(
    Object.entries(vars).filter(([, value]) => value.trim() !== ''),
  );

export const ThemeEditor = () => {
  const { t } = useTranslation('themes');
  const advancedThemes = useThemeStore((state) => state.advancedThemes);

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [lightVars, setLightVars] = useState<Vars>({});
  const [darkVars, setDarkVars] = useState<Vars>({});
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const startNewTheme = () => {
    setEditingPath(null);
    setName('');
    setLightVars({ ...NEW_THEME_TEMPLATE.vars });
    setDarkVars({ ...NEW_THEME_TEMPLATE.dark });
    setIsOpen(true);
  };

  const loadThemeForEditing = async (path: string) => {
    try {
      const text = await readTextFile(path, { baseDir: BaseDirectory.AppData });
      const theme = parseAdvancedTheme(JSON.parse(text));
      setEditingPath(path);
      setName(theme.name);
      setLightVars({ ...(theme.vars ?? {}) });
      setDarkVars({ ...(theme.dark ?? {}) });
      setIsOpen(true);
    } catch (error) {
      await reportError('themes', {
        userMessage: t('editor.loadError'),
        error,
      });
    }
  };

  const save = async (applyAfter: boolean) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }
    setIsSaving(true);
    try {
      await ensureDir(THEMES_DIR_NAME);
      const path =
        editingPath ?? `${THEMES_DIR_NAME}/${slugify(trimmedName)}.json`;
      const theme = {
        version: 1,
        name: trimmedName,
        vars: stripEmpty(lightVars),
        dark: stripEmpty(darkVars),
      };
      await writeTextFile(path, JSON.stringify(theme, null, 2), {
        baseDir: BaseDirectory.AppData,
      });
      setEditingPath(path);
      await refreshAdvancedThemeList();
      if (applyAfter) {
        await loadAndApplyAdvancedThemeFromFile(path);
      }
    } catch (error) {
      await reportError('themes', {
        userMessage: t('editor.saveError'),
        error,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTheme = async () => {
    if (!editingPath) {
      return;
    }
    try {
      await remove(editingPath, { baseDir: BaseDirectory.AppData });
      await refreshAdvancedThemeList();
      setIsOpen(false);
      setEditingPath(null);
    } catch (error) {
      await reportError('themes', {
        userMessage: t('editor.deleteError'),
        error,
      });
    }
  };

  const setLightVar = (key: string, value: string) =>
    setLightVars((previous) => ({ ...previous, [key]: value }));
  const setDarkVar = (key: string, value: string) =>
    setDarkVars((previous) => ({ ...previous, [key]: value }));

  return (
    <ScrollableArea className="overflow-hidden">
      <SectionShell data-testid="theme-editor" title={t('editor.title')}>
        <div className="flex flex-col gap-4 p-1">
          <div className="flex flex-wrap items-end gap-2">
            <div className="max-w-80 flex-1">
              <Select
                description={t('editor.pickDescription')}
                placeholder={t('selectPlaceholder')}
                options={advancedThemes.map((theme) => ({
                  id: theme.path,
                  label: theme.name,
                }))}
                value={editingPath ?? ''}
                onValueChange={loadThemeForEditing}
              />
            </div>
            <Button onClick={startNewTheme}>{t('editor.newTheme')}</Button>
          </div>

          {isOpen && (
            <>
              <div className="max-w-80">
                <Input
                  aria-label={t('editor.nameLabel')}
                  placeholder={t('editor.namePlaceholder')}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-8">
                <VarsSection
                  title={t('editor.lightSection')}
                  vars={lightVars}
                  onChange={setLightVar}
                />
                <VarsSection
                  title={t('editor.darkSection')}
                  vars={darkVars}
                  onChange={setDarkVar}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isSaving || !name.trim()}
                  onClick={() => save(false)}
                >
                  {t('editor.save')}
                </Button>
                <Button
                  disabled={isSaving || !name.trim()}
                  onClick={() => save(true)}
                >
                  {t('editor.saveAndApply')}
                </Button>
                {editingPath && (
                  <Button onClick={deleteTheme}>{t('editor.delete')}</Button>
                )}
              </div>
            </>
          )}
        </div>
      </SectionShell>
    </ScrollableArea>
  );
};
