import { FC, useState, useMemo } from 'react';
import {
  Ban,
  Music,
  User,
  Clock,
  Calendar,
  Trash2,
  Plus,
  History,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';

import { ViewShell, Button } from '@nuclearplayer/ui';

import { useStatsStore } from '../../stores/statsStore';
import { useBlockStore } from '../../stores/blockStore';

export const Stats: FC = () => {
  const [activeTab, setActiveTab] = useState<'recap' | 'blocks'>('recap');

  // Stats data
  const history = useStatsStore((state) => state.history);
  const clearHistory = useStatsStore((state) => state.clearHistory);

  // Block store data
  const blockedArtists = useBlockStore((state) => state.blockedArtists);
  const blockedGenres = useBlockStore((state) => state.blockedGenres);
  const addBlockedArtist = useBlockStore((state) => state.addBlockedArtist);
  const removeBlockedArtist = useBlockStore((state) => state.removeBlockedArtist);
  const addBlockedGenre = useBlockStore((state) => state.addBlockedGenre);
  const removeBlockedGenre = useBlockStore((state) => state.removeBlockedGenre);

  // Input states for blocking
  const [artistInput, setArtistInput] = useState('');
  const [genreInput, setGenreInput] = useState('');

  // Calculations for Stats
  const totalPlays = history.length;

  const totalPlaytimeMins = useMemo(() => {
    let totalMs = 0;
    for (const entry of history) {
      totalMs += entry.durationMs || 210000; // Assume 3.5 minutes if unknown
    }
    return Math.round(totalMs / 60000);
  }, [history]);

  const topArtists = useMemo(() => {
    const counts: Record<string, { count: number; artworkUrl?: string }> = {};
    for (const entry of history) {
      if (!entry.artist) continue;
      const artist = entry.artist;
      if (!counts[artist]) {
        counts[artist] = { count: 0, artworkUrl: entry.artworkUrl };
      }
      counts[artist].count++;
    }
    return Object.entries(counts)
      .map(([name, { count, artworkUrl }]) => ({ name, count, artworkUrl }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [history]);

  const topTracks = useMemo(() => {
    const counts: Record<string, { count: number; artist: string; artworkUrl?: string }> = {};
    for (const entry of history) {
      const key = `${entry.title} - ${entry.artist}`;
      if (!counts[key]) {
        counts[key] = { count: 0, artist: entry.artist, artworkUrl: entry.artworkUrl };
      }
      counts[key].count++;
    }
    return Object.entries(counts)
      .map(([key, { count, artist, artworkUrl }]) => {
        const title = key.substring(0, key.lastIndexOf(' - '));
        return { title, artist, count, artworkUrl };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [history]);

  const timeOfDayStats = useMemo(() => {
    // Categories: Morning (6-12), Afternoon (12-18), Evening (18-24), Night (0-6)
    const counts = { Morning: 0, Afternoon: 0, Evening: 0, Night: 0 };
    for (const entry of history) {
      const hour = new Date(entry.timestamp).getHours();
      if (hour >= 6 && hour < 12) counts.Morning++;
      else if (hour >= 12 && hour < 18) counts.Afternoon++;
      else if (hour >= 18 && hour < 24) counts.Evening++;
      else counts.Night++;
    }
    return counts;
  }, [history]);

  const daysOfWeekStats = useMemo(() => {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = Array(7).fill(0);
    for (const entry of history) {
      const day = new Date(entry.timestamp).getDay();
      counts[day]++;
    }
    return dayNames.map((name, i) => ({ name, count: counts[i] }));
  }, [history]);

  const handleBlockArtistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = artistInput.trim();
    if (name) {
      void addBlockedArtist(name);
      setArtistInput('');
    }
  };

  const handleBlockGenreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = genreInput.trim();
    if (name) {
      void addBlockedGenre(name);
      setGenreInput('');
    }
  };

  const formatTime = (totalMinutes: number) => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} mins`;
  };

  return (
    <ViewShell data-testid="stats-view" title="Recap & Filters">
      <div className="flex flex-col gap-6 p-4">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border gap-4 pb-2">
          <button
            onClick={() => setActiveTab('recap')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-md transition-all ${
              activeTab === 'recap'
                ? 'border-b-2 border-accent text-accent bg-primary/20'
                : 'text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Sparkles size={16} />
            Listening Recap
          </button>
          <button
            onClick={() => setActiveTab('blocks')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-md transition-all ${
              activeTab === 'blocks'
                ? 'border-b-2 border-accent text-accent bg-primary/20'
                : 'text-foreground-secondary hover:text-foreground'
            }`}
          >
            <Ban size={16} />
            Artist & Genre Filters
          </button>
        </div>

        {/* Tab 1: Listening Recap */}
        {activeTab === 'recap' && (
          <div className="flex flex-col gap-6">
            {totalPlays === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-primary/10 border border-border/50 rounded-lg shadow-inner gap-4 text-center">
                <History size={48} className="text-foreground-secondary animate-pulse" />
                <h3 className="text-xl font-bold">No Listening History Yet</h3>
                <p className="text-foreground-secondary max-w-md">
                  Start listening to tracks in Fusion! Once you play some music, your listening habits and trends will be visualised here.
                </p>
              </div>
            ) : (
              <>
                {/* Stats Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-primary/25 border border-border/40 p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center gap-4">
                    <div className="bg-accent/10 text-accent p-3 rounded-lg">
                      <Music size={24} />
                    </div>
                    <div>
                      <div className="text-xs text-foreground-secondary font-semibold uppercase tracking-wider">Total Plays</div>
                      <div className="text-2xl font-bold">{totalPlays}</div>
                    </div>
                  </div>

                  <div className="bg-primary/25 border border-border/40 p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center gap-4">
                    <div className="bg-accent/10 text-accent p-3 rounded-lg">
                      <Clock size={24} />
                    </div>
                    <div>
                      <div className="text-xs text-foreground-secondary font-semibold uppercase tracking-wider">Listening Time</div>
                      <div className="text-2xl font-bold">{formatTime(totalPlaytimeMins)}</div>
                    </div>
                  </div>

                  <div className="bg-primary/25 border border-border/40 p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center gap-4">
                    <div className="bg-accent/10 text-accent p-3 rounded-lg">
                      <User size={24} />
                    </div>
                    <div className="truncate flex-1">
                      <div className="text-xs text-foreground-secondary font-semibold uppercase tracking-wider">Top Artist</div>
                      <div className="text-lg font-bold truncate">{topArtists[0]?.name || 'N/A'}</div>
                      {topArtists[0] && (
                        <div className="text-xs text-foreground-secondary">{topArtists[0].count} plays</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-primary/25 border border-border/40 p-4 rounded-xl shadow-md hover:shadow-lg transition-shadow flex items-center gap-4">
                    <div className="bg-accent/10 text-accent p-3 rounded-lg">
                      <TrendingUp size={24} />
                    </div>
                    <div className="truncate flex-1">
                      <div className="text-xs text-foreground-secondary font-semibold uppercase tracking-wider">Top Track</div>
                      <div className="text-lg font-bold truncate">{topTracks[0]?.title || 'N/A'}</div>
                      {topTracks[0] && (
                        <div className="text-xs text-foreground-secondary truncate">
                          {topTracks[0].artist} • {topTracks[0].count} plays
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Subsections Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Top Artists and Top Tracks */}
                  <div className="flex flex-col gap-6">
                    {/* Top Artists Card */}
                    <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                      <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
                        <User size={18} className="text-accent" />
                        Top Artists
                      </h3>
                      <div className="flex flex-col gap-3">
                        {topArtists.map((artist, idx) => {
                          const maxCount = topArtists[0]?.count || 1;
                          const pct = (artist.count / maxCount) * 100;
                          return (
                            <div key={artist.name} className="flex flex-col gap-1.5">
                              <div className="flex justify-between items-center text-sm font-semibold">
                                <span className="flex items-center gap-2 truncate">
                                  <span className="text-accent font-bold w-4">#{idx + 1}</span>
                                  <span className="truncate">{artist.name}</span>
                                </span>
                                <span className="text-foreground-secondary text-xs">{artist.count} plays</span>
                              </div>
                              <div className="w-full bg-border/20 h-2 rounded-full overflow-hidden">
                                <div
                                  className="bg-accent h-full rounded-full transition-all duration-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Top Tracks Card */}
                    <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                      <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
                        <Music size={18} className="text-accent" />
                        Top Tracks
                      </h3>
                      <div className="flex flex-col gap-3">
                        {topTracks.map((track, idx) => (
                          <div key={`${track.title}-${track.artist}`} className="flex items-center gap-3 py-1 border-b border-border/10 last:border-b-0">
                            <span className="text-accent font-bold text-sm w-4 shrink-0">#{idx + 1}</span>
                            {track.artworkUrl ? (
                              <img src={track.artworkUrl} className="w-10 h-10 rounded object-cover shrink-0" alt="Track Cover" />
                            ) : (
                              <div className="w-10 h-10 bg-border/20 flex items-center justify-center rounded shrink-0">
                                <Music size={16} className="text-foreground-secondary" />
                              </div>
                            )}
                            <div className="truncate flex-1">
                              <div className="text-sm font-bold truncate">{track.title}</div>
                              <div className="text-xs text-foreground-secondary truncate">{track.artist}</div>
                            </div>
                            <span className="text-xs text-foreground-secondary bg-primary/20 px-2 py-1 rounded shrink-0">
                              {track.count} plays
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Listening trends */}
                  <div className="flex flex-col gap-6">
                    {/* Time of Day Card */}
                    <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                      <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
                        <Clock size={18} className="text-accent" />
                        Listening Routine
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(timeOfDayStats).map(([timeOfDay, count]) => {
                          const maxCount = Math.max(...Object.values(timeOfDayStats)) || 1;
                          const pct = (count / maxCount) * 100;
                          return (
                            <div key={timeOfDay} className="bg-primary/20 border border-border/10 p-3 rounded-lg flex flex-col gap-2">
                              <span className="text-xs font-semibold text-foreground-secondary">{timeOfDay}</span>
                              <span className="text-lg font-extrabold">{count} plays</span>
                              <div className="w-full bg-border/10 h-1 rounded-full overflow-hidden">
                                <div
                                  className="bg-accent h-full rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Day of Week Card */}
                    <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                      <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
                        <Calendar size={18} className="text-accent" />
                        Weekly Trend
                      </h3>
                      <div className="flex flex-col gap-2.5">
                        {daysOfWeekStats.map((day) => {
                          const maxCount = Math.max(...daysOfWeekStats.map(d => d.count)) || 1;
                          const pct = (day.count / maxCount) * 100;
                          return (
                            <div key={day.name} className="flex items-center gap-3">
                              <span className="text-xs font-semibold text-foreground-secondary w-20 shrink-0">{day.name}</span>
                              <div className="flex-1 bg-border/20 h-3 rounded-full overflow-hidden">
                                <div
                                  className="bg-accent h-full rounded-full transition-all duration-300"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-foreground-secondary w-8 text-right shrink-0">{day.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recent listening history */}
                <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                  <div className="flex justify-between items-center border-b border-border/40 pb-2">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <History size={18} className="text-accent" />
                      Recent History
                    </h3>
                    <Button
                      size="sm"
                      variant="text"
                      className="text-accent-red hover:underline flex items-center gap-1"
                      onClick={() => {
                        if (confirm('Are you sure you want to clear your listening history? This cannot be undone.')) {
                          void clearHistory();
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      Clear History
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-96 pr-2">
                    {history.slice(0, 30).map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border/5 last:border-b-0 hover:bg-primary/5 px-2 rounded-md transition-colors">
                        <div className="flex items-center gap-3 truncate flex-1">
                          {entry.artworkUrl ? (
                            <img src={entry.artworkUrl} className="w-8 h-8 rounded object-cover shrink-0" alt="Cover" />
                          ) : (
                            <div className="w-8 h-8 bg-border/20 flex items-center justify-center rounded shrink-0">
                              <Music size={12} className="text-foreground-secondary" />
                            </div>
                          )}
                          <div className="truncate">
                            <span className="text-sm font-bold block truncate">{entry.title}</span>
                            <span className="text-xs text-foreground-secondary block truncate">{entry.artist}</span>
                          </div>
                        </div>
                        <span className="text-xs text-foreground-secondary shrink-0">
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 2: Filters & Blocklist */}
        {activeTab === 'blocks' && (
          <div className="flex flex-col gap-6">
            {/* Explanatory text */}
            <div className="p-4 bg-primary/10 border-l-4 border-accent rounded-r-lg text-sm text-foreground-secondary leading-relaxed">
              <span className="font-bold text-foreground block mb-1">About Block Filters</span>
              Tracks featuring blocked artists or containing blocked styles/genres will be automatically skipped when loaded in the playback queue. You can block artists directly from their profile headers or manage them manually here.
            </div>

            {/* Block Input Panels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Block Artist Form */}
              <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
                  <User size={18} className="text-accent" />
                  Block Artist
                </h3>
                <form onSubmit={handleBlockArtistSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter artist name..."
                    value={artistInput}
                    onChange={(e) => setArtistInput(e.target.value)}
                    className="flex-1 bg-background border border-border px-3 py-2 rounded-md text-sm outline-none focus:border-accent"
                  />
                  <Button type="submit" size="sm" className="flex items-center gap-1">
                    <Plus size={16} />
                    Block
                  </Button>
                </form>
              </div>

              {/* Block Style/Genre Form */}
              <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4">
                <h3 className="text-lg font-bold flex items-center gap-2 border-b border-border/40 pb-2">
                  <Music size={18} className="text-accent" />
                  Block Music Style / Genre
                </h3>
                <form onSubmit={handleBlockGenreSubmit} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter genre name..."
                    value={genreInput}
                    onChange={(e) => setGenreInput(e.target.value)}
                    className="flex-1 bg-background border border-border px-3 py-2 rounded-md text-sm outline-none focus:border-accent"
                  />
                  <Button type="submit" size="sm" className="flex items-center gap-1">
                    <Plus size={16} />
                    Block
                  </Button>
                </form>
              </div>
            </div>

            {/* Block Lists display */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Blocked Artists list */}
              <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4 min-h-[300px]">
                <h3 className="text-md font-bold text-foreground-secondary border-b border-border/10 pb-2 flex justify-between items-center">
                  <span>Blocked Artists ({blockedArtists.length})</span>
                </h3>
                {blockedArtists.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-foreground-secondary gap-2">
                    <User size={36} className="opacity-40" />
                    <span className="text-sm font-semibold">No blocked artists</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[400px] pr-2">
                    {blockedArtists.map((artist) => (
                      <span
                        key={artist}
                        className="bg-accent-red/10 border border-accent-red/20 text-accent-red px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 transition-all hover:bg-accent-red/20"
                      >
                        {artist}
                        <button
                          onClick={() => void removeBlockedArtist(artist)}
                          className="hover:text-foreground hover:scale-110 transition-transform"
                          title={`Unblock ${artist}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Blocked Genres list */}
              <div className="bg-primary/10 border border-border/40 p-5 rounded-xl shadow-md flex flex-col gap-4 min-h-[300px]">
                <h3 className="text-md font-bold text-foreground-secondary border-b border-border/10 pb-2 flex justify-between items-center">
                  <span>Blocked Styles/Genres ({blockedGenres.length})</span>
                </h3>
                {blockedGenres.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-foreground-secondary gap-2">
                    <Music size={36} className="opacity-40" />
                    <span className="text-sm font-semibold">No blocked styles/genres</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[400px] pr-2">
                    {blockedGenres.map((genre) => (
                      <span
                        key={genre}
                        className="bg-accent-red/10 border border-accent-red/20 text-accent-red px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 transition-all hover:bg-accent-red/20"
                      >
                        {genre}
                        <button
                          onClick={() => void removeBlockedGenre(genre)}
                          className="hover:text-foreground hover:scale-110 transition-transform"
                          title={`Unblock ${genre}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </ViewShell>
  );
};
