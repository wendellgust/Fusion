import { DownloadIcon, Loader2Icon } from 'lucide-react';
import type { FC } from 'react';

import { Button, Dialog } from '@nuclearplayer/ui';

export type DownloadJobState = {
  id: string;
  title: string;
  total: number;
  completed: number;
  currentTrack: string;
  progress: number;
  status: 'processing' | 'zipping' | 'ready' | 'error';
  downloadUrl?: string | null;
  error?: string | null;
};

type DownloadProgressDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  job: DownloadJobState | null;
};

export const DownloadProgressDialog: FC<DownloadProgressDialogProps> = ({
  isOpen,
  onClose,
  job,
}) => {
  if (!job) return null;

  const isReady = job.status === 'ready';
  const isError = job.status === 'error';

  return (
    <Dialog.Root isOpen={isOpen} onClose={isReady || isError ? onClose : () => {}}>
      <Dialog.Title>
        <span className="flex items-center gap-2">
          {isReady ? (
            <DownloadIcon className="text-emerald-500" size={20} />
          ) : (
            <Loader2Icon className="animate-spin text-primary" size={20} />
          )}
          {isReady ? 'Download Ready!' : isError ? 'Download Failed' : `Downloading "${job.title}"...`}
        </span>
      </Dialog.Title>

      <div className="my-4 flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm font-semibold">
          <span className="text-muted-foreground max-w-[240px] truncate">
            {isReady
              ? 'ZIP Archive created successfully'
              : isError
                ? job.error
                : job.currentTrack || 'Fetching track details...'}
          </span>
          <span className="text-primary font-bold">{job.progress}%</span>
        </div>

        {/* Animated Progress Bar Container */}
        <div className="bg-muted relative h-3 w-full overflow-hidden rounded-full">
          <div
            className={`h-full transition-all duration-300 ease-out ${
              isError ? 'bg-destructive' : isReady ? 'bg-emerald-500' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, Math.max(5, job.progress))}%` }}
          />
        </div>

        <div className="text-muted-foreground flex justify-between font-mono text-xs">
          <span>
            {job.completed} of {job.total} tracks downloaded
          </span>
          <span>{job.status.toUpperCase()}</span>
        </div>
      </div>

      <Dialog.Actions>
        {isReady && job.downloadUrl && (
          <a
            href={job.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={`${job.title || 'Playlist'}.zip`}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
            onClick={onClose}
          >
            <DownloadIcon size={16} />
            Download ZIP
          </a>
        )}
        {(isReady || isError) && (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )}
      </Dialog.Actions>
    </Dialog.Root>
  );
};
