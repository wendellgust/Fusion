import React from 'react';

import App from './App';
import { initLogStream } from './hooks/useLogStream';
import { startAdvancedThemeWatcher } from './services/advancedThemeDirService';
import { applyAdvancedThemeFromSettingsIfAny } from './services/advancedThemeService';
import { initBridgeHandler } from './services/bridge/bridgeHandler';
import { registerBuiltInCoreSettings } from './services/coreSettings';
import { initDiscordHandler } from './services/discordHandler';
import { initDiscoveryService } from './services/discoveryService';
import { initHttpApiHandler } from './services/httpApi';
import {
  applyLanguageFromSettings,
  initLanguageWatcher,
} from './services/languageService';
import { loadMarketplaceThemes } from './services/marketplaceThemeDirService';
import { initMcpHandler } from './services/mcp';
import { initMpdHandler } from './services/mpd';
import { hydratePluginsFromRegistry } from './services/plugins/pluginBootstrap';
import { ytdlpEnsureInstalled } from './services/tauri/commands';
import {
  applyYtdlpSettingsFromStore,
  initYtdlpSettingsWatcher,
} from './services/ytdlpService';
import { initializeFavoritesStore } from './stores/favoritesStore';
import { initializePlaylistStore } from './stores/playlistStore';
import { initializeQueueStore } from './stores/queueStore';
import { initializeRadioStore } from './stores/radioStore';
import { initializeSettingsStore } from './stores/settingsStore';
import { initializeShortcutsStore } from './stores/shortcutsStore';
import { hydrateThemeStore } from './stores/themeStore';
import { useUpdaterStore } from './stores/updaterStore';
import { initializeBlockStore } from './stores/blockStore';
import { initializeStatsStore } from './stores/statsStore';

export const initPlayerApp = async (
  root: ReturnType<typeof import('react-dom/client').createRoot>,
) => {
  initLogStream();

  await initializeSettingsStore()
    .then(() => initializeShortcutsStore())
    .then(() => initializeQueueStore())
    .then(() => initializeBlockStore())
    .then(() => initializeStatsStore())
    .then(() => initializeFavoritesStore())
    .then(() => initializePlaylistStore())
    .then(() => initializeRadioStore())
    .then(() => registerBuiltInCoreSettings())
    .then(() => initDiscoveryService())
    .then(() => initMcpHandler())
    .then(() => initMpdHandler())
    .then(() => initHttpApiHandler())
    .then(() => initBridgeHandler())
    .then(() => initDiscordHandler())
    .then(() => applyLanguageFromSettings())
    .then(() => initLanguageWatcher())
    .then(() => applyYtdlpSettingsFromStore())
    .then(() => initYtdlpSettingsWatcher())
    .then(() => startAdvancedThemeWatcher())
    .then(() => loadMarketplaceThemes())
    .then(() => hydrateThemeStore())
    .then(() => applyAdvancedThemeFromSettingsIfAny())
    .then(() => {
      void hydratePluginsFromRegistry();
      void useUpdaterStore.getState().checkForUpdate();
      void ytdlpEnsureInstalled();
    });

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};
