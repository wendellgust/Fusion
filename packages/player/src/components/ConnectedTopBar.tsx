import { useCanGoBack, useRouter } from '@tanstack/react-router';
import { SettingsIcon } from 'lucide-react';
import { FC } from 'react';

import {
  Button,
  Tooltip,
  TopBar,
  TopBarLogo,
  TopBarNavigation,
} from '@nuclearplayer/ui';

import { useAppVersion } from '../hooks/useAppVersion';
import { useCanGoForward } from '../hooks/useCanGoForward';
import { useFramelessWindow } from '../hooks/useFramelessWindow';
import { useSettingsModalStore } from '../stores/settingsModalStore';
import { ConnectedThemeController } from './ConnectedThemeController';
import { ConnectedUserAccountButton } from './ConnectedUserAccountButton';
import { JamQrCodeButton } from './JamQrCodeButton';
import { SearchBox } from './SearchBox';

export const ConnectedTopBar: FC = () => {
  const router = useRouter();
  const { version } = useAppVersion();
  const canGoBack = useCanGoBack();
  const canGoForward = useCanGoForward();
  const frameless = useFramelessWindow();
  const openSettings = useSettingsModalStore((state) => state.open);

  return (
    <TopBar draggable={frameless}>
      <div className="flex flex-row items-center gap-4">
        <Tooltip
          content={`Fusion ${version}`}
          side="bottom"
          wrapperClassName="flex items-center"
        >
          <TopBarLogo />
        </Tooltip>
        <TopBarNavigation
          onBack={() => router.history.back()}
          onForward={() => router.history.forward()}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
      </div>
      <SearchBox />
      <div className="flex flex-row items-center justify-end gap-2">
        <ConnectedUserAccountButton />
        <JamQrCodeButton />
        <ConnectedThemeController />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openSettings()}
          title="Preferences"
          aria-label="Preferences"
          className="text-foreground hover:bg-background-secondary rounded-full"
        >
          <SettingsIcon size={18} />
        </Button>
      </div>
    </TopBar>
  );
};
