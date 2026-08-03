import ReactDOM from 'react-dom/client';

import '@nuclearplayer/tailwind-config';
import '@nuclearplayer/themes';
import '@nuclearplayer/i18n';

import { setupTauriWebPolyfill } from './services/tauriWebPolyfill';

setupTauriWebPolyfill();

const root = ReactDOM.createRoot(document.getElementById('root')!);
const isRemoteMode = new URLSearchParams(window.location.search).has('remote');

if (isRemoteMode) {
  const { initRemoteApp } = await import('./remoteControl');
  initRemoteApp(root);
} else {
  const { initPlayerApp } = await import('./initPlayerApp');
  await initPlayerApp(root);
}
