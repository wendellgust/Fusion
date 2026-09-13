import { FC } from 'react';

import { Button } from '@nuclearplayer/ui';

import { useIpodClassicStore } from '../../stores/ipodClassicStore';

export const IpodButton: FC<{
  className?: string;
  size?: 'default' | 'sm' | 'lg' | 'icon';
}> = ({ className = '', size = 'icon' }) => {
  const { toggle, isOpen } = useIpodClassicStore();

  return (
    <Button
      size={size}
      variant="text"
      onClick={toggle}
      title="iPod Clássico"
      aria-label="iPod Clássico"
      className={`transition-all duration-200 ${className} ${
        isOpen
          ? 'bg-primary/20 text-primary'
          : 'text-foreground-secondary hover:text-foreground'
      }`}
    >
      {/* Retro iPod SVG Icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-5"
      >
        {/* iPod Outer Body */}
        <rect x="5" y="2" width="14" height="20" rx="3" />
        {/* iPod Screen */}
        <rect x="7" y="4" width="10" height="7" rx="1" />
        {/* Click Wheel Ring */}
        <circle cx="12" cy="16.5" r="3.5" />
        {/* Center Button */}
        <circle cx="12" cy="16.5" r="1.2" fill="currentColor" />
      </svg>
    </Button>
  );
};
