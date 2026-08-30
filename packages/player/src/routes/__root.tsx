import { createRootRoute } from '@tanstack/react-router';
import {
  Activity,
  BarChart3,
  CableIcon,
  DiscIcon,
  GaugeIcon,
  ListMusicIcon,
  MicVocalIcon,
  MusicIcon,
  Radio,
  SettingsIcon,
  UserIcon,
} from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '@nuclearplayer/i18n';
import {
  PlayerShell,
  PlayerWorkspace,
  RouteTransition,
  SidebarNavigation,
  SidebarNavigationItem,
  Toaster,
} from '@nuclearplayer/ui';

import { ConnectedPlayerBar } from '../components/ConnectedPlayerBar';
import {
  ConnectedQueuePanel,
  QueueHeaderActions,
} from '../components/ConnectedQueuePanel';
import { ConnectedSettingsModal } from '../components/ConnectedSettingsModal';
import { ConnectedTopBar } from '../components/ConnectedTopBar';
import { DevTools } from '../components/DevTools';
import { FlatpakWarningBanner } from '../components/FlatpakWarningBanner';
import { LyricsPanel } from '../components/LyricsPanel';
import { PomodoroTimer } from '../components/PomodoroTimer';
import { SoundProvider } from '../components/SoundProvider';
import { StreamResolver } from '../components/StreamResolver';
import { GlobalShortcuts } from '../shortcuts';
import { useLayoutStore } from '../stores/layoutStore';
import { useSettingsModalStore } from '../stores/settingsModalStore';
import { useStartupStore } from '../stores/startupStore';

type RightTab = 'queue' | 'lyrics';

const RootComponent = () => {
  const { t } = useTranslation('navigation');
  const { t: tPrefs } = useTranslation('preferences');
  const {
    leftSidebar,
    rightSidebar,
    toggleLeftSidebar,
    toggleRightSidebar,
    setLeftSidebarWidth,
    setRightSidebarWidth,
  } = useLayoutStore();
  const openSettings = useSettingsModalStore((state) => state.open);
  const isStartingUp = useStartupStore((state) => state.isStartingUp);
  const [rightTab, setRightTab] = useState<RightTab>('queue');

  return (
    <PlayerShell>
      <GlobalShortcuts />
      <div>
        <FlatpakWarningBanner />
        <ConnectedTopBar />
      </div>
      {!isStartingUp && <StreamResolver />}
      <SoundProvider>
        <PlayerWorkspace>
          <PlayerWorkspace.LeftSidebar
            width={leftSidebar.width}
            isCollapsed={leftSidebar.isCollapsed}
            onWidthChange={setLeftSidebarWidth}
            onToggle={toggleLeftSidebar}
          >
            <SidebarNavigation
              isCompact={leftSidebar.isCollapsed}
              className="h-full overflow-hidden"
            >
              <div className="flex flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto pr-1 pb-16 [scrollbar-width:thin]">
                <SidebarNavigationItem
                  to="/dashboard"
                  icon={<GaugeIcon />}
                  label={t('dashboard')}
                />
                <SidebarNavigationItem
                  to="/playlists"
                  icon={<ListMusicIcon />}
                  label={t('playlists')}
                />
                <SidebarNavigationItem
                  to="/stats"
                  icon={<BarChart3 />}
                  label="Recap & Filters"
                />
                <SidebarNavigationItem
                  to="/favorites/albums"
                  icon={<DiscIcon />}
                  label={t('favoriteAlbums')}
                />
                <SidebarNavigationItem
                  to="/favorites/tracks"
                  icon={<MusicIcon />}
                  label={t('favoriteTracks')}
                />
                <SidebarNavigationItem
                  to="/favorites/artists"
                  icon={<UserIcon />}
                  label={t('favoriteArtists')}
                />
                <SidebarNavigationItem
                  to="/radio"
                  icon={<Radio />}
                  label={t('radio')}
                />
                <SidebarNavigationItem
                  to="/sources"
                  icon={<CableIcon />}
                  label={t('sources')}
                />
                <SidebarNavigationItem
                  to="/lyrics"
                  icon={<MicVocalIcon />}
                  label="Lyrics"
                />
                <SidebarNavigationItem
                  to="/visualizer"
                  icon={<Activity />}
                  label="Visualizer"
                />
                <div className="pt-2">
                  <PomodoroTimer isCompact={leftSidebar.isCollapsed} />
                </div>
                <SidebarNavigationItem
                  icon={<SettingsIcon />}
                  label={tPrefs('title')}
                  onClick={() => openSettings()}
                />
              </div>
            </SidebarNavigation>
          </PlayerWorkspace.LeftSidebar>

          <PlayerWorkspace.Main>
            <RouteTransition />
          </PlayerWorkspace.Main>

          <PlayerWorkspace.RightSidebar
            width={rightSidebar.width}
            isCollapsed={rightSidebar.isCollapsed}
            onWidthChange={setRightSidebarWidth}
            onToggle={toggleRightSidebar}
            headerActions={
              rightSidebar.isCollapsed ? undefined : (
                <div className="flex items-center gap-1">
                  {rightTab === 'queue' && <QueueHeaderActions />}
                  <div className="border-border/30 flex overflow-hidden rounded-md border">
                    <button
                      className={`px-2 py-0.5 text-xs font-medium transition-colors ${rightTab === 'queue' ? 'bg-primary text-primary-foreground' : 'text-foreground-secondary hover:text-foreground'}`}
                      onClick={() => setRightTab('queue')}
                      title="Queue"
                    >
                      Queue
                    </button>
                    <button
                      className={`flex items-center gap-1 px-2 py-0.5 text-xs font-medium transition-colors ${rightTab === 'lyrics' ? 'bg-primary text-primary-foreground' : 'text-foreground-secondary hover:text-foreground'}`}
                      onClick={() => setRightTab('lyrics')}
                      title="Lyrics"
                    >
                      <MicVocalIcon size={11} />
                      Lyrics
                    </button>
                  </div>
                </div>
              )
            }
          >
            {rightTab === 'queue' || rightSidebar.isCollapsed ? (
              <ConnectedQueuePanel isCollapsed={rightSidebar.isCollapsed} />
            ) : (
              <LyricsPanel />
            )}
          </PlayerWorkspace.RightSidebar>
        </PlayerWorkspace>
      </SoundProvider>

      <ConnectedPlayerBar />
      <Toaster />
      <ConnectedSettingsModal />
      <DevTools />
    </PlayerShell>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
