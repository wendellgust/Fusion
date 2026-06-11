import { FC, useState } from 'react';
import { Edit2, Play, Plus, Radio, Trash2 } from 'lucide-react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';
import { Button, Dialog, EmptyState, Input, ScrollableArea, ViewShell } from '@nuclearplayer/ui';

import { useQueueActions } from '../../hooks/useQueueActions';
import { RadioStation, useRadioStore } from '../../stores/radioStore';

export const RadioView: FC = () => {
  const { t } = useTranslation('radio');
  const stations = useRadioStore((state) => state.stations);
  const addStation = useRadioStore((state) => state.addStation);
  const removeStation = useRadioStore((state) => state.removeStation);
  const editStation = useRadioStore((state) => state.editStation);

  const queueActions = useQueueActions();

  // Add dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  // Edit dialog state
  const [editingStation, setEditingStation] = useState<RadioStation | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');

  const playStation = (station: RadioStation) => {
    const track: Track = {
      title: station.name,
      artists: [
        {
          name: 'Internet Radio',
          roles: [],
          source: { provider: 'radio', id: 'radio' },
        },
      ],
      durationMs: 0,
      source: { provider: 'radio', id: station.id },
      streamCandidates: [
        {
          id: `radio-${station.id}`,
          title: station.name,
          failed: false,
          source: { provider: 'radio', id: station.id },
          stream: {
            url: station.url,
            protocol: 'http',
            source: { provider: 'radio', id: station.id },
          },
        },
      ],
    };

    queueActions.playNow(track);
  };

  const handleAdd = async () => {
    const trimmedName = newName.trim();
    const trimmedUrl = newUrl.trim();
    if (!trimmedName || !trimmedUrl) {
      return;
    }
    await addStation({ name: trimmedName, url: trimmedUrl });
    setNewName('');
    setNewUrl('');
    setIsAddOpen(false);
  };

  const handleEdit = async () => {
    if (!editingStation) {
      return;
    }
    const trimmedName = editName.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedName || !trimmedUrl) {
      return;
    }
    await editStation(editingStation.id, { name: trimmedName, url: trimmedUrl });
    setEditingStation(null);
  };

  const startEditing = (station: RadioStation) => {
    setEditingStation(station);
    setEditName(station.name);
    setEditUrl(station.url);
  };

  return (
    <ViewShell data-testid="radio-view" title={t('title')}>
      <div className="flex h-full w-full flex-col p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
          <Button onClick={() => setIsAddOpen(true)} className="flex items-center gap-2">
            <Plus size={16} />
            {t('addStation')}
          </Button>
        </div>

        <ScrollableArea className="flex-1">
          {stations.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <EmptyState
                icon={<Radio size={48} />}
                title={t('noStations')}
                description={t('noStationsSubtitle')}
                action={
                  <Button onClick={() => setIsAddOpen(true)} size="sm">
                    {t('addStation')}
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {stations.map((station) => (
                <div
                  key={station.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-card/60 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:bg-card hover:shadow-md hover:shadow-primary/5"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Radio size={24} className="animate-pulse" style={{ animationDuration: '3s' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                        {station.name}
                      </h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {station.url}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-border/50 pt-4">
                    <Button
                      size="sm"
                      onClick={() => playStation(station)}
                      className="flex items-center gap-2 px-4 py-2 hover:scale-105 transition-transform"
                    >
                      <Play size={14} fill="currentColor" />
                      Play
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon-sm"
                        variant="text"
                        onClick={() => startEditing(station)}
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 size={14} />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="text"
                        onClick={() => removeStation(station.id)}
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollableArea>
      </div>

      {/* Add Station Dialog */}
      <Dialog.Root isOpen={isAddOpen} onClose={() => setIsAddOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
        >
          <Dialog.Title>{t('addStation')}</Dialog.Title>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label={t('stationName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. My Favorite FM"
              autoFocus
              required
            />
            <Input
              label={t('stationUrl')}
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              placeholder={t('urlPlaceholder')}
              required
            />
          </div>
          <Dialog.Actions>
            <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
            <Button type="submit">{t('common:actions.save')}</Button>
          </Dialog.Actions>
        </form>
      </Dialog.Root>

      {/* Edit Station Dialog */}
      <Dialog.Root isOpen={!!editingStation} onClose={() => setEditingStation(null)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleEdit();
          }}
        >
          <Dialog.Title>{t('editStation')}</Dialog.Title>
          <div className="mt-4 flex flex-col gap-4">
            <Input
              label={t('stationName')}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. My Favorite FM"
              autoFocus
              required
            />
            <Input
              label={t('stationUrl')}
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              placeholder={t('urlPlaceholder')}
              required
            />
          </div>
          <Dialog.Actions>
            <Dialog.Close>{t('common:actions.cancel')}</Dialog.Close>
            <Button type="submit">{t('common:actions.save')}</Button>
          </Dialog.Actions>
        </form>
      </Dialog.Root>
    </ViewShell>
  );
};
