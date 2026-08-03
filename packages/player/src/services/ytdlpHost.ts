import { invoke } from '@tauri-apps/api/core';

import type {
  YtdlpHost,
  YtdlpPlaylistInfo,
  YtdlpSearchResult,
  YtdlpStreamInfo,
} from '@nuclearplayer/plugin-sdk';

import { isTauriDesktop } from './tauriWebPolyfill';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.mha.fi',
];

const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de/api/v1',
  'https://inv.tux.pizza/api/v1',
  'https://vid.puffyan.us/api/v1',
  'https://invidious.drgns.space/api/v1',
];

async function fetchWithCorsProxy(url: string, timeoutMs = 2500): Promise<any> {
  // 1. Direct fetch
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  // 2. Local Express proxy fallback to bypass browser CORS policy
  try {
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // ignore
  }

  return null;
}

async function fetchFromPiped(path: string): Promise<any> {
  for (const instance of PIPED_INSTANCES) {
    const data = await fetchWithCorsProxy(`${instance}${path}`);
    if (data) return data;
  }
  return null;
}

async function fetchFromInvidious(path: string): Promise<any> {
  for (const instance of INVIDIOUS_INSTANCES) {
    const data = await fetchWithCorsProxy(`${instance}${path}`);
    if (data) return data;
  }
  return null;
}

export const ytdlpHost: YtdlpHost = {
  search: async (
    query: string,
    maxResults?: number,
  ): Promise<YtdlpSearchResult[]> => {
    if (isTauriDesktop()) {
      return invoke<YtdlpSearchResult[]>('ytdlp_search', {
        query,
        maxResults: maxResults ?? 10,
      });
    }

    // Web Browser Mode: Search Piped or Invidious
    const pipedRes = await fetchFromPiped(
      `/search?q=${encodeURIComponent(query)}&filter=music_songs`,
    );

    if (pipedRes?.items?.length) {
      return pipedRes.items.slice(0, maxResults ?? 10).map((item: any) => ({
        id: item.url?.replace('/watch?v=', '') || item.id,
        title: item.title,
        uploader: item.uploaderName || 'YouTube',
        duration: item.duration || 180,
        thumbnail: item.thumbnail || undefined,
      }));
    }

    const invRes = await fetchFromInvidious(
      `/search?q=${encodeURIComponent(query)}&type=video`,
    );
    if (Array.isArray(invRes)) {
      return invRes.slice(0, maxResults ?? 10).map((item: any) => ({
        id: item.videoId,
        title: item.title,
        uploader: item.author || 'YouTube',
        duration: item.lengthSeconds || 180,
        thumbnail: item.videoThumbnails?.[0]?.url || undefined,
      }));
    }

    return [];
  },

  getStream: async (videoId: string): Promise<YtdlpStreamInfo> => {
    if (isTauriDesktop()) {
      return invoke<YtdlpStreamInfo>('ytdlp_get_stream', { videoId });
    }

    // Web Browser Mode: Get stream URL from Piped or Invidious
    const pipedData = await fetchFromPiped(`/streams/${videoId}`);
    if (pipedData?.audioStreams?.length > 0) {
      const rawUrl = pipedData.audioStreams[0].url;
      const proxiedUrl = `/api/proxy-audio?url=${encodeURIComponent(rawUrl)}`;
      return {
        stream_url: proxiedUrl,
        duration: pipedData.duration,
        title: pipedData.title,
        container: 'm4a',
        codec: 'aac',
      };
    }

    const invData = await fetchFromInvidious(`/videos/${videoId}`);
    if (invData?.adaptiveFormats) {
      const audioFormat = invData.adaptiveFormats.find(
        (f: any) => f.type && f.type.startsWith('audio/'),
      );
      if (audioFormat?.url) {
        const proxiedUrl = `/api/proxy-audio?url=${encodeURIComponent(audioFormat.url)}`;
        return {
          stream_url: proxiedUrl,
          duration: invData.lengthSeconds,
          title: invData.title,
          container: 'm4a',
          codec: 'aac',
        };
      }
    }

    throw new Error(`Could not resolve stream for video ID ${videoId}`);
  },

  getPlaylist: async (url: string): Promise<YtdlpPlaylistInfo> => {
    if (isTauriDesktop()) {
      return invoke<YtdlpPlaylistInfo>('ytdlp_get_playlist', { url });
    }

    const listId = url.split('list=')[1] || url;
    const pipedData = await fetchFromPiped(`/playlists/${listId}`);
    if (pipedData) {
      return {
        id: listId,
        title: pipedData.title || 'Playlist',
        entries: (pipedData.relatedStreams || []).map((item: any) => ({
          id: item.url?.replace('/watch?v=', '') || item.id,
          title: item.title,
          uploader: item.uploaderName || 'YouTube',
          duration: item.duration || 180,
          thumbnail: item.thumbnail || undefined,
        })),
      };
    }

    return { id: listId, title: 'Playlist', entries: [] };
  },
};
