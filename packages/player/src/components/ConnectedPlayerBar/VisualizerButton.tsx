import { Link, useRouterState } from '@tanstack/react-router';
import { Activity } from 'lucide-react';
import { FC } from 'react';

import { Button } from '@nuclearplayer/ui';

export const VisualizerButton: FC = () => {
  const routerState = useRouterState();
  const isOnVisualizer = routerState.location.pathname === '/visualizer';

  return (
    <Link to={isOnVisualizer ? '/dashboard' : '/visualizer'}>
      <Button
        size="icon-sm"
        variant={isOnVisualizer ? 'default' : 'text'}
        className={`${
          isOnVisualizer
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
        aria-label="Toggle Visualizer"
      >
        <Activity size={16} />
      </Button>
    </Link>
  );
};
