import { FC, ReactNode } from 'react';

import { cn } from '../../utils';
import { SidebarCompactProvider } from './SidebarCompactContext';

type SidebarNavigationProps = {
  children: ReactNode;
  isCompact?: boolean;
  className?: string;
};

export const SidebarNavigation: FC<SidebarNavigationProps> = ({
  children,
  isCompact = false,
  className,
}) => {
  return (
    <SidebarCompactProvider isCompact={isCompact}>
      <div data-testid="sidebar-navigation" className={cn("flex flex-1 flex-col", className)}>
        {children}
      </div>
    </SidebarCompactProvider>
  );
};
