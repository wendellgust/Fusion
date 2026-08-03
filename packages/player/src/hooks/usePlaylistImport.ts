import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { useTranslation } from '@nuclearplayer/i18n';

import { importPlaylistFromJson } from '../services/playlistImport';
import { usePlaylistStore } from '../stores/playlistStore';
import { reportError } from '../utils/logging';

export const usePlaylistImport = () => {
  const { t } = useTranslation('playlists');

  const importFromJson = useCallback(async () => {
    try {
      let content = '';

      // Try native Tauri file picker first if available
      try {
        const filePath = await open({
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        if (filePath) {
          content = await readTextFile(filePath as string);
        }
      } catch {
        // Fallback for Web Browser & Mobile: HTML file picker input
        content = await new Promise<string>((resolve, reject) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.json,application/json';
          input.style.display = 'none';
          input.onchange = (e: any) => {
            const file = e.target?.files?.[0];
            if (!file) {
              resolve('');
              return;
            }
            const reader = new FileReader();
            reader.onload = (event) => resolve((event.target?.result as string) || '');
            reader.onerror = (err) => reject(err);
            reader.readAsText(file);
          };
          document.body.appendChild(input);
          input.click();
          setTimeout(() => input.remove(), 1000);
        });
      }

      if (!content || !content.trim()) {
        return;
      }

      const parsed = JSON.parse(content);
      const playlists = importPlaylistFromJson(parsed);

      if (playlists.length === 0) {
        toast.warning(t('importNoPlaylists'));
        return;
      }

      const store = usePlaylistStore.getState();
      for (const playlist of playlists) {
        await store.importPlaylist(playlist);
      }
      toast.success(
        playlists.length === 1
          ? t('importSuccess')
          : t('importBatchSuccess', { count: playlists.length }),
      );
    } catch (error) {
      await reportError('playlists', {
        userMessage: t('importError'),
        error,
      });
    }
  }, [t]);

  return { importFromJson };
};
