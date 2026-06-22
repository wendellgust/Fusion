import { createFileRoute } from '@tanstack/react-router';

import { LyricsView } from '../views/Lyrics';

export const Route = createFileRoute('/lyrics')({
  component: LyricsView,
});
