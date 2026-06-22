import { AlertCircle, ListPlus, Music, X } from 'lucide-react';
import { FC } from 'react';

import { pickArtwork } from '@nuclearplayer/model';

import { cn } from '../../utils';
import { formatTimeMillis } from '../../utils/time';
import { Box } from '../Box';
import { Button } from '../Button';
import type { QueueItemProps } from './types';
import { queueItemVariants } from './variants';

export const QueueItemExpanded: FC<QueueItemProps> = ({
  track,
  status = 'idle',
  isCurrent = false,
  onSelect,
  onRemove,
  onAddToPlaylist,
  labels,
  classes,
}) => {
  const thumbnail = pickArtwork(track.artwork, 'thumbnail', 64);
  const duration = formatTimeMillis(track.durationMs);
  const primaryArtist = track.artists[0]?.name;

  return (
    <Box
      data-testid="queue-item"
      data-is-current={isCurrent}
      variant="tertiary"
      shadow="none"
      className={cn(
        'group',
        queueItemVariants({ status, isCurrent, isCollapsed: false }),
        classes?.root,
      )}
      onClick={onSelect}
      onDoubleClick={onSelect}
      role={onSelect ? 'button' : undefined}
    >
      {status === 'error' && (
        <div className="bg-accent-red absolute top-0 right-0 bottom-0 left-0 w-2 border-0" />
      )}
      <div
        data-testid="queue-item-thumbnail"
        className={cn(
          'bg-background flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm',
          classes?.thumbnail,
        )}
      >
        {thumbnail?.url ? (
          <img
            src={thumbnail.url}
            alt={track.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <Music
            size={32}
            absoluteStrokeWidth
            className="text-foreground opacity-20"
          />
        )}
      </div>

      <div className={cn('min-w-0 flex-1', classes?.content)}>
        <div
          data-testid="queue-item-title"
          className={cn(
            'text-foreground truncate text-sm font-bold',
            classes?.title,
          )}
        >
          {track.title}
        </div>
        <div
          data-testid="queue-item-artist"
          className={cn('text-foreground truncate text-xs', classes?.artist)}
        >
          {primaryArtist}
        </div>
        {status === 'error' && (
          <div
            data-testid="queue-item-error"
            className={cn(
              'bg-accent-red text-foreground border-border mt-1 inline-flex max-w-full items-center gap-1 rounded-sm border px-1 py-0.5 text-xs',
              classes?.error,
            )}
          >
            <AlertCircle size={12} />
            <span className="truncate">{labels.playbackError}</span>
          </div>
        )}
      </div>

      <div className="relative flex shrink-0 items-center justify-start">
        {duration && (
          <div
            data-testid="queue-item-duration"
            className={cn(
              'text-foreground mr-4 text-sm tabular-nums transition-opacity group-hover:opacity-0',
              classes?.duration,
            )}
          >
            {duration}
          </div>
        )}

        <div className="absolute right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onAddToPlaylist && (
            <Button
              data-testid="queue-item-add-to-playlist-button"
              size="icon-sm"
              variant="noShadow"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAddToPlaylist();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={labels?.addToPlaylistButton}
              title={labels?.addToPlaylistButton}
            >
              <ListPlus size={16} />
            </Button>
          )}
          {onRemove && (
            <Button
              data-testid="queue-item-remove-button"
              size="icon-sm"
              variant="noShadow"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onRemove();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={labels?.removeButton}
              className={cn(classes?.removeButton)}
            >
              <X size={16} />
            </Button>
          )}
        </div>
      </div>

      {status === 'loading' && (
        <div className="bg-stripes-diagonal absolute inset-x-0 bottom-0 h-1" />
      )}
    </Box>
  );
};
