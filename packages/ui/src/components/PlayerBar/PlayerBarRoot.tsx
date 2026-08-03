import { FC, ReactNode } from 'react';

import { BottomBar } from '..';
import { cn } from '../../utils';

export type PlayerBarRootProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
};

export const PlayerBarRoot: FC<PlayerBarRootProps> = ({
  left,
  center,
  right,
  className = '',
}) => (
  <BottomBar className={cn('px-2 py-1.5 md:px-4 md:py-2', className)}>
    <div className="flex w-full items-center justify-between gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4">
      {left && <div className="min-w-0 flex-1 md:flex-initial">{left}</div>}
      {center && <div className="shrink-0 justify-self-center">{center}</div>}
      {right && <div className="hidden shrink-0 justify-self-end md:flex">{right}</div>}
    </div>
  </BottomBar>
);
