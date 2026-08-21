import type { Stream, Track } from '@nuclearplayer/plugin-sdk';
import { providersHost } from './providersHost';

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.private.coffee',
  'https://pipedapi.drgns.space',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.mha.fi',
];

const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://inv.tux.pizza',
  'https://vid.puffyan.us',
  'https://invidious.drgns.space',
];

async function fetchFromPiped(path: string) {
  for (const instance of PIPED_INSTANCES) {
    try {
      const directUrl = `${instance}${path}`;
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(directUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      /* continue to next instance */
    }
  }
  return null;
}

async function fetchFromInvidious(path: string) {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const directUrl = `${instance}${path}`;
      const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(directUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        return await res.json();
      }
    } catch {
      /* continue to next instance */
    }
  }
  return null;
}

// Built-in Web Metadata Provider using Deezer & ListenBrainz APIs
export const webMetadataProvider = {
  id: 'built-in-web-metadata',
  kind: 'metadata' as const,
  name: 'Built-in Web Metadata',
  description: 'Provides music search and discovery in Web Browser Mode',
  sourceName: 'Web Metadata',
  icon: 'globe',
  meta: {
    name: 'Built-in Web Metadata',
    description: 'Provides music search and discovery in Web Browser Mode',
    sourceName: 'Web Metadata',
    icon: 'globe',
  },

  async search(query: string): Promise<any> {
    const deezerUrl = `/api/proxy-download?url=${encodeURIComponent(
      `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=25`,
    )}`;

    try {
      const res = await fetch(deezerUrl);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();

      const tracks: Track[] = (data.data || []).map((item: any) => {
        const trackTitle = item.title || item.title_short || 'Unknown Track';
        const artistName = item.artist?.name || 'Unknown Artist';
        const trackQuery = `${artistName} ${trackTitle}`.trim();
        return {
          id: trackQuery,
          name: trackTitle,
          artist: artistName,
          album: item.album?.title || 'Unknown Album',
          duration: item.duration || 0,
          thumbnail: item.album?.cover_medium || item.artist?.picture_medium || '',
          source: { provider: 'built-in-web-metadata', id: trackQuery },
        };
      });

      return { tracks };
    } catch {
      return { tracks: [] };
    }
  },

  async getArtistDetails(artistId: string): Promise<any> {
    const url = `/api/proxy-download?url=${encodeURIComponent(
      `https://api.deezer.com/artist/${artistId}`,
    )}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      return {
        id: String(data.id),
        name: data.name,
        description: '',
        thumbnail: data.picture_xl || data.picture_medium || '',
        genres: [],
        similarArtists: [],
        topTracks: [],
        albums: [],
      };
    } catch {
      return {
        id: artistId,
        name: 'Artist',
        description: '',
        thumbnail: '',
        genres: [],
        similarArtists: [],
        topTracks: [],
        albums: [],
      };
    }
  },

  async getAlbumDetails(albumId: string): Promise<any> {
    const url = `/api/proxy-download?url=${encodeURIComponent(
      `https://api.deezer.com/album/${albumId}`,
    )}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      const tracks: Track[] = (data.tracks?.data || []).map((item: any) => {
        const trackTitle = item.title || item.title_short || 'Unknown Track';
        const artistName = item.artist?.name || data.artist?.name || 'Unknown Artist';
        const trackQuery = `${artistName} ${trackTitle}`.trim();
        return {
          id: trackQuery,
          name: trackTitle,
          artist: artistName,
          album: data.title || 'Unknown Album',
          duration: item.duration || 0,
          thumbnail: data.cover_medium || '',
          source: { provider: 'built-in-web-metadata', id: trackQuery },
        };
      });

      return {
        id: String(data.id),
        name: data.title,
        artist: data.artist?.name || 'Unknown Artist',
        coverImage: data.cover_xl || data.cover_medium || '',
        releaseDate: data.release_date || '',
        tracks,
      };
    } catch {
      return {
        id: albumId,
        name: 'Album',
        artist: 'Artist',
        coverImage: '',
        releaseDate: '',
        tracks: [],
      };
    }
  },

  async getTopTracks(): Promise<Track[]> {
    const url = `/api/proxy-download?url=${encodeURIComponent(
      'https://api.deezer.com/chart/0/tracks?limit=50',
    )}`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      return (data.data || []).map((item: any) => {
        const trackTitle = item.title || item.title_short || 'Unknown Track';
        const artistName = item.artist?.name || 'Unknown Artist';
        const trackQuery = `${artistName} ${trackTitle}`.trim();
        return {
          id: trackQuery,
          name: trackTitle,
          artist: artistName,
          album: item.album?.title || 'Unknown Album',
          duration: item.duration || 0,
          thumbnail: item.album?.cover_medium || '',
          source: { provider: 'built-in-web-metadata', id: trackQuery },
        };
      });
    } catch {
      return [];
    }
  },
};

// Built-in Web Streaming Provider utilizing server-side yt-dlp & Piped / Invidious fallback
export const webStreamingProvider = {
  id: 'built-in-web-streaming',
  kind: 'streaming' as const,
  name: 'Built-in Web Streaming',
  description: 'Resolves stream audio for Web Browser Mode',
  sourceName: 'Web Streams',
  icon: 'play',
  meta: {
    name: 'Built-in Web Streaming',
    description: 'Resolves stream audio for Web Browser Mode',
    sourceName: 'Web Streams',
    icon: 'play',
  },

  async search(query: string): Promise<any> {
    return webMetadataProvider.search(query);
  },

  async searchForTrack(artist: string, title: string): Promise<any[]> {
    const query = `${artist || ''} ${title || ''}`.trim();
    return [
      {
        id: query,
        title,
        artist,
        source: 'built-in-web-streaming',
      },
    ];
  },

  async searchForTrackV2(track: any): Promise<any[]> {
    const artistName = track.artist || track.artists?.[0]?.name || 'Unknown Artist';
    const trackTitle = track.title || track.name || 'Unknown Track';
    const query = `${artistName} ${trackTitle}`.trim();
    return [
      {
        id: query,
        title: trackTitle,
        artist: artistName,
        source: 'built-in-web-streaming',
      },
    ];
  },

  async getStreamUrl(candidateId: string): Promise<Stream> {
    // 1. Local Raspberry Pi Audio File or Direct HTTP Audio
    if (candidateId.startsWith('/api/stream')) {
      return {
        url: candidateId,
        protocol: 'http',
        source: { provider: 'built-in-web-streaming', id: candidateId },
      };
    }

    if (candidateId.startsWith('http://') || candidateId.startsWith('https://')) {
      return {
        url: candidateId,
        protocol: 'http',
        source: { provider: 'built-in-web-streaming', id: candidateId },
      };
    }

    // 2. Internet Radio Streams (SomaFM / Icecast)
    if (
      candidateId.toLowerCase().includes('somafm') ||
      candidateId.toLowerCase().includes('icecast')
    ) {
      return {
        url: 'https://ice2.somafm.com/groovesalad-128-mp3',
        protocol: 'http',
        source: { provider: 'built-in-web-streaming', id: candidateId },
      };
    }

    // 3. System server yt-dlp API resolution (/api/yt-stream) returning direct stream URL
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const ytRes = await fetch(`/api/yt-stream?q=${encodeURIComponent(candidateId)}`);
        if (ytRes.ok) {
          const json = await ytRes.json();
          if (json.success && json.url) {
            return {
              url: json.url,
              protocol: 'http',
              source: { provider: 'built-in-web-streaming', id: candidateId },
            };
          }
        }
      } catch (err) {
        console.warn(`Server yt-stream API resolution attempt ${attempt} error:`, err);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }

    // 4. Fallback to Piped API
    const videoId = candidateId.includes(' ') ? '' : candidateId;
    if (videoId) {
      const pipedData = await fetchFromPiped(`/streams/${videoId}`);
      if (pipedData?.audioStreams?.length > 0) {
        const streamUrl = pipedData.audioStreams[0].url;
        return {
          url: streamUrl,
          protocol: 'http',
          source: { provider: 'built-in-web-streaming', id: candidateId },
        };
      }

      const invData = await fetchFromInvidious(`/videos/${videoId}`);
      if (invData?.adaptiveFormats) {
        const audioFormat = invData.adaptiveFormats.find(
          (f: any) => f.type && f.type.startsWith('audio/'),
        );
        if (audioFormat?.url) {
          return {
            url: audioFormat.url,
            protocol: 'http',
            source: { provider: 'built-in-web-streaming', id: candidateId },
          };
        }
      }
    }

    // 5. Search Piped if candidateId is a query string
    const pipedSearch = await fetchFromPiped(
      `/search?q=${encodeURIComponent(candidateId)}&filter=music_songs`,
    );

    if (pipedSearch?.items?.[0]?.url) {
      const foundId = pipedSearch.items[0].url.replace('/watch?v=', '');
      const pipedData = await fetchFromPiped(`/streams/${foundId}`);
      if (pipedData?.audioStreams?.[0]?.url) {
        return {
          url: pipedData.audioStreams[0].url,
          protocol: 'http',
          source: { provider: 'built-in-web-streaming', id: candidateId },
        };
      }
    }

    throw new Error(`Could not resolve stream for track: ${candidateId}`);
  },

  async getStreamUrlV2(candidate: any): Promise<Stream> {
    const candidateId = candidate.id || `${candidate.artist || ''} ${candidate.title || ''}`.trim();
    return this.getStreamUrl(candidateId);
  },
};

export function registerBuiltInWebProviders() {
  providersHost.register(webMetadataProvider as any);
  providersHost.register(webStreamingProvider as any);
  providersHost.setActive('metadata', 'built-in-web-metadata');
  providersHost.setActive('streaming', 'built-in-web-streaming');
}
