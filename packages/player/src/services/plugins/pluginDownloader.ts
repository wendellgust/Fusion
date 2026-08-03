import { appDataDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, remove } from '@tauri-apps/plugin-fs';

import { ensureDir } from '../../utils/path';
import { downloadFile, extractZip } from '../tauri/commands';
import { isTauriDesktop } from '../tauriWebPolyfill';
import { storeWebPluginFiles } from './webPluginStorage';
import { unpackZipInMemory } from './webZipUnpacker';

const DOWNLOADS_DIR = 'plugins/.downloads';

type DownloadPluginOptions = {
  pluginId: string;
  downloadUrl: string;
};

const getDownloadsDir = async (): Promise<string> => {
  try {
    await ensureDir(DOWNLOADS_DIR);
    const base = await appDataDir();
    return join(base, DOWNLOADS_DIR);
  } catch {
    return DOWNLOADS_DIR;
  }
};

export const downloadAndExtractPlugin = async ({
  pluginId,
  downloadUrl,
}: DownloadPluginOptions): Promise<string> => {
  if (isTauriDesktop()) {
    try {
      const downloadsDir = await getDownloadsDir();
      const zipPath = await join(downloadsDir, `${pluginId}.zip`);
      const extractPath = await join(downloadsDir, pluginId);
      const relativeZipPath = await join(DOWNLOADS_DIR, `${pluginId}.zip`);

      await downloadFile(downloadUrl, zipPath);
      await extractZip(zipPath, extractPath);
      await remove(relativeZipPath, { baseDir: BaseDirectory.AppData }).catch(
        () => {},
      );

      return extractPath;
    } catch (err) {
      console.warn(
        'Native plugin download failed, falling back to browser web loader:',
        err,
      );
    }
  }

  // Browser Web Plugin Fetcher via local proxy endpoint
  try {
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(downloadUrl)}`;
    const res = await fetch(proxyUrl);
    let arrayBuf: ArrayBuffer;
    if (!res.ok) {
      const directRes = await fetch(downloadUrl);
      arrayBuf = await directRes.arrayBuffer();
    } else {
      arrayBuf = await res.arrayBuffer();
    }

    const extractedFiles = await unpackZipInMemory(arrayBuf);
    const rawObj: Record<string, string> = {};
    extractedFiles.forEach((v, k) => (rawObj[k] = v));

    // Send files to local server-side Node.js esbuild transpiler endpoint
    try {
      const compileRes = await fetch('/api/compile-plugin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: rawObj }),
      }).then((r) => r.json());

      if (compileRes?.success && compileRes.files) {
        const finalFiles = new Map<string, string>();
        Object.entries(compileRes.files).forEach(([k, v]) =>
          finalFiles.set(k, String(v)),
        );
        storeWebPluginFiles(pluginId, finalFiles);
      } else {
        storeWebPluginFiles(pluginId, extractedFiles);
      }
    } catch {
      storeWebPluginFiles(pluginId, extractedFiles);
    }
  } catch (err) {
    console.warn(`Browser plugin fetch for ${pluginId} failed:`, err);
  }

  return `web_plugin:${pluginId}`;
};

export const cleanupDownload = async (pluginId: string): Promise<void> => {
  if (isTauriDesktop()) {
    try {
      const downloadsDir = await getDownloadsDir();
      const extractPath = await join(downloadsDir, pluginId);
      await remove(extractPath, { recursive: true }).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  }
};
