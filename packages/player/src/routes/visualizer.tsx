import { createFileRoute } from '@tanstack/react-router';

import { VisualizerView } from '../views/Visualizer';

export const Route = createFileRoute('/visualizer')({
  component: VisualizerView,
});
