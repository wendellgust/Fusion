import { FileUpIcon } from 'lucide-react';
import React, { useState, type FC } from 'react';
import { toast } from 'sonner';

import { useTranslation } from '@nuclearplayer/i18n';
import { Button, Dialog } from '@nuclearplayer/ui';

import { importPlaylistFromJson } from '../../../services/playlistImport';
import { usePlaylistStore } from '../../../stores/playlistStore';

type ImportFromJsonDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const ImportFromJsonDialog: FC<ImportFromJsonDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation('playlists');
  const [jsonText, setJsonText] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const processImportContent = async (content: string) => {
    if (!content || !content.trim()) return;
    setIsImporting(true);
    try {
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
      setJsonText('');
      onClose();
    } catch (err: any) {
      toast.error(t('importError') + ': ' + (err?.message || 'Invalid JSON'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      void processImportContent(text);
    };
    reader.readAsText(file);
  };

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      <Dialog.Title>{t('importJson')}</Dialog.Title>
      <Dialog.Description>
        Choose a JSON file from your device or paste the JSON text below.
      </Dialog.Description>

      <div className="my-4 flex flex-col gap-4">
        <label className="border-border hover:bg-muted flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors">
          <FileUpIcon size={32} className="text-muted-foreground" />
          <span className="text-sm font-semibold">Click to select JSON file</span>
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        <div className="flex items-center gap-2">
          <div className="border-border h-[1px] flex-1 border-b" />
          <span className="text-muted-foreground text-xs uppercase font-semibold">or paste json</span>
          <div className="border-border h-[1px] flex-1 border-b" />
        </div>

        <textarea
          rows={4}
          placeholder='{"name": "My Playlist", "items": [...]}'
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          className="border-border bg-background w-full rounded-md border p-3 text-xs font-mono"
        />
      </div>

      <Dialog.Actions>
        <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
        <Button
          disabled={!jsonText.trim() || isImporting}
          onClick={() => processImportContent(jsonText)}
        >
          {isImporting ? 'Importing...' : 'Import JSON'}
        </Button>
      </Dialog.Actions>
    </Dialog.Root>
  );
};
