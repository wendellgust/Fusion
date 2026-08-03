import { invoke } from '@tauri-apps/api/core';

import type {
  HttpHost,
  HttpRequestInit,
  HttpResponseData,
} from '@nuclearplayer/plugin-sdk';

import { Logger } from './logger';
import { isTauriDesktop } from './tauriWebPolyfill';

export const httpHost: HttpHost = {
  fetch: async (
    url: string,
    init?: HttpRequestInit,
  ): Promise<HttpResponseData> => {
    const method = init?.method ?? 'GET';
    Logger.http.debug(`${method} ${url}`);

    if (isTauriDesktop()) {
      try {
        const response = await invoke<HttpResponseData>('http_fetch', {
          request: {
            url,
            method,
            headers: init?.headers,
            body: init?.body,
          },
        });

        if (response && typeof response.status === 'number') {
          Logger.http.debug(`${method} ${url} -> ${response.status}`);
          return response;
        }
      } catch (err) {
        Logger.http.warn(
          `Tauri http_fetch failed, falling back to web fetch: ${String(err)}`,
        );
      }
    }

    // Web Browser Fetch Fallback using local CORS Proxy Endpoint
    try {
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}`;
      const res = await fetch(proxyUrl, {
        method,
        headers: init?.headers as HeadersInit,
        body: init?.body,
      });

      const bodyText = await res.text();
      const headersObj: Record<string, string> = {};
      res.headers.forEach((v, k) => (headersObj[k] = v));

      return {
        status: res.status,
        headers: headersObj,
        body: bodyText,
      };
    } catch {
      // Direct fetch fallback if proxy fails
      try {
        const res = await fetch(url, {
          method,
          headers: init?.headers as HeadersInit,
          body: init?.body,
        });

        const bodyText = await res.text();
        const headersObj: Record<string, string> = {};
        res.headers.forEach((v, k) => (headersObj[k] = v));

        return {
          status: res.status,
          headers: headersObj,
          body: bodyText,
        };
      } catch (directErr) {
        return {
          status: 500,
          headers: {},
          body: String(directErr),
        };
      }
    }
  },
};
