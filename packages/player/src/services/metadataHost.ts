import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  ArtistSocialStats,
  PlaylistRef,
  SearchCategory,
  SearchParams,
  SearchResults,
  TrackRef,
} from '@nuclearplayer/model';
import {
  MissingCapabilityError,
  type ArtistMetadataCapability,
  type MetadataHost,
  type MetadataProvider,
} from '@nuclearplayer/plugin-sdk';

import { providersHost } from './providersHost';

const ALL_CATEGORIES: SearchCategory[] = [
  'artists',
  'albums',
  'tracks',
  'playlists',
];

const onlyCategories = (values: string[] | undefined): SearchCategory[] => {
  if (!values) {
    return [];
  }

  // Dedupe categories and filter out junk
  const set = new Set<SearchCategory>(ALL_CATEGORIES);
  return values.filter((v): v is SearchCategory =>
    set.has(v as SearchCategory),
  );
};

const resolveTypes = (
  provider: MetadataProvider,
  requested: SearchCategory[] | undefined,
): SearchCategory[] => {
  return requested ?? onlyCategories(provider.searchCapabilities);
};

const executeMetadataSearch = async (
  provider: MetadataProvider,
  params: SearchParams,
): Promise<SearchResults> => {
  const unified =
    provider.searchCapabilities?.includes('unified') && provider.search;
  if (unified) {
    return provider.search!(params);
  }

  const types = resolveTypes(provider, params.types);
  const want = new Set(types);

  const artistsPromise =
    want.has('artists') && provider.searchArtists
      ? provider.searchArtists({ query: params.query, limit: params.limit })
      : undefined;
  const albumsPromise =
    want.has('albums') && provider.searchAlbums
      ? provider.searchAlbums({ query: params.query, limit: params.limit })
      : undefined;
  const tracksPromise =
    want.has('tracks') && provider.searchTracks
      ? provider.searchTracks({ query: params.query, limit: params.limit })
      : undefined;
  const playlistsPromise =
    want.has('playlists') && provider.searchPlaylists
      ? provider.searchPlaylists({ query: params.query, limit: params.limit })
      : undefined;

  const [artists, albums, tracks, playlists] = await Promise.all([
    artistsPromise ?? Promise.resolve(undefined),
    albumsPromise ?? Promise.resolve(undefined),
    tracksPromise ?? Promise.resolve(undefined),
    playlistsPromise ?? Promise.resolve(undefined),
  ]);

  const result: SearchResults = {};
  if (artists) {
    result.artists = artists;
  }
  if (albums) {
    result.albums = albums;
  }
  if (tracks) {
    result.tracks = tracks;
  }
  if (playlists) {
    result.playlists = playlists;
  }
  return result;
};

export const createMetadataHost = (): MetadataHost => {
  const getProvider = (providerId?: string): MetadataProvider | undefined =>
    providersHost.get<MetadataProvider>(
      providerId ?? providersHost.getActive('metadata'),
      'metadata',
    );

  const withArtistCapability =
    <TResult>(
      capability: ArtistMetadataCapability,
      method: keyof MetadataProvider,
    ) =>
    async (entityId: string, providerId?: string): Promise<TResult> => {
      const provider = getProvider(providerId);
      if (!provider) {
        throw new Error('No metadata provider available');
      }
      if (!provider.artistMetadataCapabilities?.includes(capability)) {
        throw new MissingCapabilityError(capability, provider.name);
      }
      return (provider[method] as (id: string) => Promise<TResult>)!(entityId);
    };

  return {
    search: async (
      params: SearchParams,
      providerId?: string,
    ): Promise<SearchResults> => {
      if (providerId) {
        const provider = getProvider(providerId);
        if (!provider) {
          throw new Error('No metadata provider available');
        }
        return executeMetadataSearch(provider, params);
      }

      const allProviders = providersHost.list('metadata') as MetadataProvider[];
      if (allProviders.length === 0) {
        throw new Error('No metadata provider available');
      }

      const settled = await Promise.allSettled(
        allProviders.map((p) => executeMetadataSearch(p, params)),
      );

      const merged: SearchResults = {};
      for (const result of settled) {
        if (result.status === 'rejected') {
          continue;
        }
        const r = result.value;
        if (r.artists) {
          merged.artists = [...(merged.artists ?? []), ...r.artists];
        }
        if (r.albums) {
          merged.albums = [...(merged.albums ?? []), ...r.albums];
        }
        if (r.tracks) {
          merged.tracks = [...(merged.tracks ?? []), ...r.tracks];
        }
        if (r.playlists) {
          merged.playlists = [...(merged.playlists ?? []), ...r.playlists];
        }
      }
      return merged;
    },

    fetchArtistBio: withArtistCapability<ArtistBio>(
      'artistBio',
      'fetchArtistBio',
    ),
    fetchArtistSocialStats: withArtistCapability<ArtistSocialStats>(
      'artistSocialStats',
      'fetchArtistSocialStats',
    ),
    fetchArtistAlbums: withArtistCapability<AlbumRef[]>(
      'artistAlbums',
      'fetchArtistAlbums',
    ),
    fetchArtistTopTracks: withArtistCapability<TrackRef[]>(
      'artistTopTracks',
      'fetchArtistTopTracks',
    ),
    fetchArtistPlaylists: withArtistCapability<PlaylistRef[]>(
      'artistPlaylists',
      'fetchArtistPlaylists',
    ),
    fetchArtistRelatedArtists: withArtistCapability<ArtistRef[]>(
      'artistRelatedArtists',
      'fetchArtistRelatedArtists',
    ),

    fetchAlbumDetails: async (
      albumId: string,
      providerId?: string,
    ): Promise<Album> => {
      const provider = getProvider(providerId);
      if (!provider) {
        throw new Error('No metadata provider available');
      }
      if (!provider.albumMetadataCapabilities?.includes('albumDetails')) {
        throw new MissingCapabilityError('albumDetails', provider.name);
      }
      return provider.fetchAlbumDetails!(albumId)!;
    },
  };
};

export const metadataHost = createMetadataHost();
