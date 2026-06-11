import { createFileRoute } from '@tanstack/react-router';

import { Stats } from '../views/Stats';

export const Route = createFileRoute('/stats')({
  component: Stats,
});
