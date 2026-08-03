import React from 'react';

import App from './App';
import { initLogStream } from './hooks/useLogStream';
import { startAdvancedThemeWatcher } from './services/advancedThemeDirService';
import { applyAdvancedThemeFromSettingsIfAny } from './services/advancedThemeService';
import { registerBuiltInWebProviders } from './services/builtInWebProviders';
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
import { setupTauriWebPolyfill } from './services/tauriWebPolyfill';
import { initializeFavoritesStore } from './stores/favoritesStore';
import { initializePlaylistStore } from './stores/playlistStore';
import { initializeQueueStore } from './stores/queueStore';
import { initializeRadioStore } from './stores/radioStore';
import { initializeSettingsStore } from './stores/settingsStore';
import { initializeShortcutsStore } from './stores/shortcutsStore';
import { hydrateThemeStore } from './stores/themeStore';
import { initializeBlockStore } from './stores/blockStore';
import { initializeStatsStore } from './stores/statsStore';

export const initPlayerApp = async (
  root: ReturnType<typeof import('react-dom/client').createRoot>,
) => {
  setupTauriWebPolyfill();
  initLogStream();

  try {
    await initializeSettingsStore().catch(() => {});
    await initializeShortcutsStore().catch(() => {});
    await initializeQueueStore().catch(() => {});
    await initializeBlockStore().catch(() => {});
    await initializeStatsStore().catch(() => {});
    await initializeFavoritesStore().catch(() => {});
    await initializePlaylistStore().catch(() => {});
    await initializeRadioStore().catch(() => {});
    registerBuiltInCoreSettings();
    initDiscoveryService();
    registerBuiltInWebProviders();
    await initMcpHandler().catch(() => {});
    await initMpdHandler().catch(() => {});
    await initHttpApiHandler().catch(() => {});
    await initBridgeHandler().catch(() => {});
    initDiscordHandler();
    await applyLanguageFromSettings().catch(() => {});
    initLanguageWatcher();
    await startAdvancedThemeWatcher().catch(() => {});
    await loadMarketplaceThemes().catch(() => {});
    hydrateThemeStore();
    await applyAdvancedThemeFromSettingsIfAny().catch(() => {});
    void hydratePluginsFromRegistry();
  } catch (err) {
    console.warn('Initialization warning in web mode:', err);
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};
