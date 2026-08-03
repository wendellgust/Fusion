// Web Browser Polyfill for Tauri IPC & Plugin Store
// Allows Nuclear Music Player to run as a full web application in any browser (e.g. hosted on a Raspberry Pi).

export function isTauriDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as unknown as {
    __IS_WEB_POLYFILL__?: boolean;
    __TAURI_INTERNALS__?: { invoke?: unknown };
  };
  return !!(win.__TAURI_INTERNALS__?.invoke && !win.__IS_WEB_POLYFILL__);
}

export function setupTauriWebPolyfill() {
  if (typeof window === 'undefined') return;

  const win = window as unknown as {
    __IS_WEB_POLYFILL__?: boolean;
    __TAURI_INTERNALS__?: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback?: (callback?: unknown) => number | undefined;
      unregisterCallback?: (id: number) => void;
      convertFileSrc?: (filePath: string, protocol?: string) => string;
      metadata?: {
        currentWindow: { label: string };
        currentWebview: { windowLabel: string; label: string };
      };
    };
    __TAURI_EVENT_PLUGIN_INTERNALS__?: Record<string, unknown>;
  };

  win.__IS_WEB_POLYFILL__ = true;
  win.__TAURI_EVENT_PLUGIN_INTERNALS__ = win.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};

  if (!win.__TAURI_INTERNALS__) {
    let nextRid = 1;
    const pathToRid = new Map<string, number>();
    const ridToPath = new Map<number, string>();
    const storeMaps = new Map<number, Map<string, unknown>>();

    const getOrCreateStore = (storePath: string): number => {
      if (pathToRid.has(storePath)) {
        return pathToRid.get(storePath)!;
      }
      const rid = nextRid++;
      pathToRid.set(storePath, rid);
      ridToPath.set(rid, storePath);

      const map = new Map<string, unknown>();
      const storageKey = `nuclear_store:${storePath}`;
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj === 'object') {
            Object.entries(obj).forEach(([k, v]) => map.set(k, v));
          }
        }
      } catch {
        // ignore storage parse errors
      }
      storeMaps.set(rid, map);
      return rid;
    };

    const syncToLocalStorage = (rid: number) => {
      const storePath = ridToPath.get(rid);
      const map = storeMaps.get(rid);
      if (!storePath || !map) return;
      const storageKey = `nuclear_store:${storePath}`;
      try {
        const obj: Record<string, unknown> = {};
        map.forEach((v, k) => (obj[k] = v));
        localStorage.setItem(storageKey, JSON.stringify(obj));
      } catch {
        // ignore storage save errors
      }
    };

    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { windowLabel: 'main', label: 'main' },
      },
      invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
        // Polyfill @tauri-apps/plugin-store IPC protocol
        if (cmd.startsWith('plugin:store|')) {
          if (cmd === 'plugin:store|load') {
            const storePath = String(args.path || 'default');
            return getOrCreateStore(storePath);
          }
          if (cmd === 'plugin:store|get_store') {
            const storePath = String(args.path || 'default');
            return pathToRid.has(storePath) ? pathToRid.get(storePath)! : null;
          }

          const rid = Number(args.rid || 0);
          const map = storeMaps.get(rid) || new Map<string, unknown>();

          if (cmd === 'plugin:store|get') {
            const key = String(args.key);
            const exists = map.has(key);
            const val = exists ? map.get(key) : undefined;
            return [val !== undefined ? val : null, exists];
          }
          if (cmd === 'plugin:store|has') {
            const key = String(args.key);
            return map.has(key);
          }
          if (cmd === 'plugin:store|set') {
            const key = String(args.key);
            map.set(key, args.value);
            syncToLocalStorage(rid);
            return null;
          }
          if (cmd === 'plugin:store|delete') {
            const key = String(args.key);
            const existed = map.delete(key);
            syncToLocalStorage(rid);
            return existed;
          }
          if (cmd === 'plugin:store|clear') {
            map.clear();
            syncToLocalStorage(rid);
            return null;
          }
          if (cmd === 'plugin:store|entries') {
            return Array.from(map.entries());
          }
          if (cmd === 'plugin:store|keys') {
            return Array.from(map.keys());
          }
          if (cmd === 'plugin:store|values') {
            return Array.from(map.values());
          }
          if (cmd === 'plugin:store|length') {
            return map.size;
          }
          if (
            cmd === 'plugin:store|save' ||
            cmd === 'plugin:store|reload' ||
            cmd === 'plugin:store|reset' ||
            cmd === 'plugin:store|close'
          ) {
            return null;
          }
        }

        if (cmd.startsWith('plugin:window|') || cmd.startsWith('plugin:webview|')) {
          if (cmd.endsWith('is_maximized') || cmd.endsWith('is_fullscreen')) return false;
          if (cmd.endsWith('is_visible')) return true;
          if (cmd.endsWith('theme')) return 'dark';
          return null;
        }

        if (cmd === 'plugin:event|listen') return 1;
        if (cmd === 'plugin:event|unlisten' || cmd === 'plugin:event|emit') return null;

        if (cmd === 'is_flatpak') return false;
        if (cmd === 'get_startup_logs') return [];
        if (cmd === 'ytdlp_ensure_installed') return true;

        return null;
      },
      transformCallback: (cb?: unknown) => (cb ? 0 : undefined),
      unregisterCallback: () => {},
      convertFileSrc: (filePath: string) => filePath,
    };
  } else if (!win.__TAURI_INTERNALS__.metadata) {
    win.__TAURI_INTERNALS__.metadata = {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
    };
  }
}
