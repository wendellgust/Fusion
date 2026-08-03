import { DownloadIcon, EllipsisVerticalIcon, PlayIcon, PlusIcon } from 'lucide-react';
import type { FC, ReactNode } from 'react';
import { useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import type { Track } from '@nuclearplayer/model';
import { Button, cn, Popover } from '@nuclearplayer/ui';

import { useQueueActions } from '../../../hooks/useQueueActions';
import { useSoundStore } from '../../../stores/soundStore';
import { DownloadProgressDialog, type DownloadJobState } from './DownloadProgressDialog';

type PlaylistActionsProps = {
  tracks: Track[];
  title?: string;
  menuItems?: ReactNode;
  className?: string;
};

const getTrackTitle = (tr: any): string => {
  if (!tr) return 'Track';
  if (typeof tr.title === 'string' && tr.title.trim()) return tr.title.trim();
  if (typeof tr.name === 'string' && tr.name.trim()) return tr.name.trim();
  if (typeof tr.name === 'object' && tr.name?.name) return tr.name.name;
  return 'Track';
};

const getTrackArtist = (tr: any): string => {
  if (!tr) return '';
  if (typeof tr.artist === 'string' && tr.artist.trim()) return tr.artist.trim();
  if (typeof tr.artist === 'object' && tr.artist?.name) return tr.artist.name;
  if (Array.isArray(tr.artists) && tr.artists[0]) {
    const first = tr.artists[0];
    if (typeof first === 'string') return first;
    if (typeof first === 'object' && first?.name) return first.name;
  }
  return '';
};

export const PlaylistActions: FC<PlaylistActionsProps> = ({
  tracks,
  title,
  menuItems,
  className,
}) => {
  const { t } = useTranslation('playlists');
  const { addToQueue, clearQueue } = useQueueActions();
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadJob, setDownloadJob] = useState<DownloadJobState | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handlePlayAll = () => {
    clearQueue();
    addToQueue(tracks);
    useSoundStore.getState().play();
  };

  const handleAddToQueue = () => {
    addToQueue(tracks);
  };

  const pollJobStatus = (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/download-playlist-status?jobId=${jobId}`);
        if (!res.ok) return;
        const job: DownloadJobState = await res.json();
        setDownloadJob(job);

        if (job.status === 'ready' && job.downloadUrl) {
          clearInterval(interval);
          setIsDownloading(false);
          const link = document.createElement('a');
          link.href = job.downloadUrl;
          link.target = '_blank';
          const downloadName = (job.title || title || 'Playlist').trim();
          link.setAttribute('download', downloadName.endsWith('.zip') ? downloadName : `${downloadName}.zip`);
          document.body.appendChild(link);
          link.click();
          setTimeout(() => link.remove(), 1000);
        } else if (job.status === 'error') {
          clearInterval(interval);
          setIsDownloading(false);
        }
      } catch (e) {
        console.error('Error polling download status:', e);
      }
    }, 800);
  };

  const handleDownloadPlaylist = async () => {
    if (!tracks || tracks.length === 0 || isDownloading) return;
    setIsDownloading(true);
    try {
      const formattedTracks = tracks.map((tr: any) => ({
        name: getTrackTitle(tr),
        artist: getTrackArtist(tr),
      }));

      const res = await fetch('/api/download-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Playlist',
          tracks: formattedTracks,
          format: 'mp3',
        }),
      });

      if (!res.ok) throw new Error('Download playlist failed');

      const data = await res.json();
      if (data.success && data.jobId) {
        setIsDialogOpen(true);
        pollJobStatus(data.jobId);
      } else {
        throw new Error(data.error || 'Failed to start download job');
      }
    } catch (err) {
      console.error('Playlist download error:', err);
      setIsDownloading(false);
    }
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Button
        variant="secondary"
        onClick={handlePlayAll}
        data-testid="play-all-button"
      >
        <PlayIcon size={16} />
        {t('play')}
      </Button>
      <Popover
        className="relative"
        panelClassName="bg-background px-0 py-0"
        trigger={
          <Button
            variant="secondary"
            size="icon"
            data-testid="playlist-actions-button"
          >
            <EllipsisVerticalIcon size={16} />
          </Button>
        }
        anchor="bottom start"
      >
        <Popover.Menu>
          <Popover.Item
            icon={<PlusIcon size={16} />}
            onClick={handleAddToQueue}
            data-testid="add-to-queue-action"
          >
            {t('addToQueue')}
          </Popover.Item>
          <Popover.Item
            icon={<DownloadIcon size={16} />}
            onClick={handleDownloadPlaylist}
            data-testid="download-playlist-action"
          >
            {isDownloading ? 'Downloading Playlist (ZIP)...' : 'Download Playlist (ZIP)'}
          </Popover.Item>
          {menuItems}
        </Popover.Menu>
      </Popover>

      <DownloadProgressDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        job={downloadJob}
      />
    </div>
  );
};
