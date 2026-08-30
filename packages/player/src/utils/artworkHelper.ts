import { pickArtwork } from '@nuclearplayer/model';

export const getTrackArtworkUrl = (track: unknown): string => {
  if (!track || typeof track !== 'object') {
    return '';
  }

  const t = track as Record<string, unknown>;

  if (typeof t.thumbnail === 'string' && t.thumbnail.trim()) {
    return t.thumbnail.trim();
  }

  const artworkObj = t.artwork as Record<string, unknown> | undefined;
  if (
    artworkObj &&
    Array.isArray(artworkObj.items) &&
    artworkObj.items.length > 0
  ) {
    const first = artworkObj.items[0] as { url?: string } | undefined;
    if (first && typeof first.url === 'string' && first.url) {
      return first.url;
    }
  }

  const albumObj = t.album as Record<string, unknown> | undefined;
  if (albumObj) {
    const albumArtwork = albumObj.artwork as
      | Record<string, unknown>
      | undefined;
    if (
      albumArtwork &&
      Array.isArray(albumArtwork.items) &&
      albumArtwork.items.length > 0
    ) {
      const first = albumArtwork.items[0] as { url?: string } | undefined;
      if (first && typeof first.url === 'string' && first.url) {
        return first.url;
      }
    }
    if (typeof albumObj.coverImage === 'string' && albumObj.coverImage) {
      return albumObj.coverImage;
    }
  }

  if (typeof t.artwork === 'string' && t.artwork) {
    return t.artwork;
  }

  try {
    const picked =
      pickArtwork(
        t.artwork as Parameters<typeof pickArtwork>[0],
        'thumbnail',
        128,
      ) ||
      pickArtwork(
        albumObj?.artwork as Parameters<typeof pickArtwork>[0],
        'thumbnail',
        128,
      );
    if (picked?.url) {
      return picked.url;
    }
  } catch {
    /* ignore fallback errors */
  }

  return '';
};
