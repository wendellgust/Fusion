import { Link, useRouterState } from '@tanstack/react-router';
import {
  Activity,
  GaugeIcon,
  Heart,
  ListMusicIcon,
  Radio,
  Search,
} from 'lucide-react';
import type { FC } from 'react';

export const MobileBottomNavBar: FC = () => {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const navItems = [
    { to: '/dashboard', label: 'Início', icon: GaugeIcon },
    { to: '/search', label: 'Buscar', icon: Search },
    { to: '/playlists', label: 'Playlists', icon: ListMusicIcon },
    { to: '/favorites/tracks', label: 'Curtidas', icon: Heart },
    { to: '/radio', label: 'Rádio', icon: Radio },
    { to: '/visualizer', label: 'Visualizer', icon: Activity },
  ];

  return (
    <nav className="border-border bg-background/95 fixed right-0 bottom-0 left-0 z-30 flex h-16 items-center justify-around border-t px-2 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl select-none md:hidden">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.to === '/dashboard'
            ? pathname === '/' || pathname === '/dashboard'
            : pathname.startsWith(item.to);

        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-1 flex-col items-center justify-center gap-1 py-1 transition-all ${
              isActive
                ? 'text-primary scale-105 font-bold'
                : 'text-foreground-secondary hover:text-foreground font-medium'
            }`}
          >
            <Icon
              size={20}
              className={
                isActive ? 'text-primary stroke-[2.5]' : 'stroke-[1.75]'
              }
            />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};
