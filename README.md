# Fusion (Nuclear Fork)

This project is a modified fork of Nuclear. It keeps the original AGPL-3.0 license and includes custom features for playback control, moderation, productivity, and UI.

Based on Nuclear, originally licensed under the GNU Affero General Public License v3.0. Modified in 2026.

## What's Different in Fusion?

Fusion adds several productivity, moderation, and personalization features to the standard Nuclear player:

### 1. Pomodoro Timer ⏱️
* **Where to find it**: Located at the bottom of the left sidebar.
* **How to use**: Click the timer to start or pause. Click the reset icon to start over. Use the settings gear icon to customize work and break intervals, toggle ticking/chime sound effects, and choose preset times.

### 2. Listening Recap & Analytics 📊
* **Where to find it**: Click **Recap & Filters** in the left sidebar.
* **How to use**: Displays detailed statistics of your listening habits:
  * Total plays and total listening time.
  * Your top 5 artists and top 5 tracks.
  * Hourly routines (Morning vs Night) and weekly listening trends.
  * Scrollable list of recent plays with a "Clear History" button.

### 3. Artist & Genre Blocklist Filters 🚫
* **Where to find & use**:
  * **On Artist Pages**: Click the `Ban` icon next to the Favorite heart button to block or unblock that artist.
  * **On Recap & Filters**: Go to the *Artist & Genre Filters* tab. Type any artist or style/genre name to block them manually.
* **Behavior**: Any queued track featuring a blocked artist or containing a blocked genre/tag is automatically skipped during playback.

### 4. Improved Presets & Browser Support 🌐
* Pre-configured with high-uptime HTTPS radio servers to avoid mixed-content web view blocks.
* Playlists can be imported using your local Floorp browser cookies configuration.

### 5. Custom Theme & Branding 🎨
* Rebranded application window, app logo, and launcher name to **Fusion**.
* Comes with the custom **Plasma** theme (violet/magenta palette) enabled as the default dark mode theme.

## Screenshots


<p align="center">
  <img src="packages/docs/.gitbook/assets/dashboard-main.png" alt="Nuclear Music Player - Dashboard" width="100%">
</p>

Nuclear comes with multiple built-in themes:

<p align="center">
  <img src="packages/docs/.gitbook/assets/dashboard-green.png" alt="Green theme" width="32%">
  <img src="packages/docs/.gitbook/assets/dashboard-aqua.png" alt="Aqua theme" width="32%">
  <img src="packages/docs/.gitbook/assets/dashboard-mint.png" alt="Mint theme" width="32%">
</p>
<p align="center">
  <img src="packages/docs/.gitbook/assets/dashboard-orange.png" alt="Orange theme" width="32%">
  <img src="packages/docs/.gitbook/assets/dashboard-red.png" alt="Red theme" width="32%">
  <img src="packages/docs/.gitbook/assets/dashboard-violet.png" alt="Violet theme" width="32%">
</p>

| | |
|:---:|:---:|
| ![Search artists](packages/docs/.gitbook/assets/search-artists.png) | ![Search albums](packages/docs/.gitbook/assets/search-albums.png) |
| Artist search | Album search |
| ![Playlists](packages/docs/.gitbook/assets/playlists.png) | ![Plugin store](packages/docs/.gitbook/assets/plugin-store.png) |
| Playlists | Plugin store |
| ![Installed plugins](packages/docs/.gitbook/assets/installed-plugins.png) | ![Preferences](packages/docs/.gitbook/assets/preferences.png) |
| Installed plugins | Preferences |
| ![What's new](packages/docs/.gitbook/assets/whats-new.png) | ![Log viewer](packages/docs/.gitbook/assets/log-viewer.png) |
| What's new | Log viewer |

## Running and Building Fusion

Since Fusion is a custom personal fork of Nuclear, you can build and run it from source.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/), [PNPM](https://pnpm.io/), and [Rust/Cargo](https://www.rust-lang.org/) installed.

### Build Instructions
1. Install project dependencies:
   ```bash
   npx pnpm install
   ```
2. Build the application:
   ```bash
   npx pnpm build
   ```
Once completed, the compiled binary will be available in:
`packages/player/src-tauri/target/release/nuclear-music-player`

### Official Upstream Releases
If you are looking for the original, unmodified, and official pre-built releases of Nuclear, please visit the [Official Nuclear Releases Page](https://github.com/nukeop/nuclear/releases).

## Features

- Search for music and stream it from any source
- Browse artist pages with biographies, discographies, and similar artists
- Browse album pages with track listings
- Queue management with shuffle, repeat, and drag-and-drop reordering
- Favorites (albums, artists, and tracks)
- Playlists (create, import, export, import from varous services)
- Powerful plugin system with a built-in plugin store
- Themes (built-in and custom CSS themes)
- MCP server lets your AI agent drive the player
- Auto-updates
- Keyboard shortcuts
- Localized in multiple languages

## Plugins

Nuclear has a powerful plugin system now! Every functionality has been redesigned to be driven by plugins.

Plugins can provide streaming sources, metadata, playlists, dashboard content, and more. Browse and install plugins from the built-in plugin store, or write your own using the [@nuclearplayer/plugin-sdk](https://www.npmjs.com/package/@nuclearplayer/plugin-sdk).

## MCP

You can enable the MCP server in Settings → Integrations.

Then to add it to **Claude Code:**

```bash
claude mcp add nuclear --transport http http://127.0.0.1:8800/mcp
```

**Codex CLI:**

```bash
codex mcp add nuclear --url http://127.0.0.1:8800/mcp
```

**OpenCode:**

```json
{
  "mcp": {
    "nuclear": {
      "type": "remote",
      "url": "http://127.0.0.1:8800/mcp"
    }
  }
}
```

**Claude Desktop / Cursor / Windsurf:**

```json
{
  "mcpServers": {
    "nuclear": {
      "url": "http://127.0.0.1:8800/mcp"
    }
  }
}
```

The MCP is designed to be discoverable, but there's a skill you can load to get your AI up to speed: [Nuclear MCP Skill](./packages/docs/public/skills/nuclear-mcp.zip)

## Development

Nuclear is a pnpm monorepo managed with Turborepo. The main app is built with Tauri (Rust + React).

### Prerequisites

- Node.js >= 22
- pnpm >= 9
- Rust (stable)
- Platform-specific Tauri dependencies ([see Tauri docs](https://v2.tauri.app/start/prerequisites/))

### Getting started

```bash
git clone https://github.com/nukeop/nuclear.git
cd nuclear
pnpm install
pnpm dev
```

### Useful commands

```bash
pnpm dev            # Run the player in dev mode
pnpm dev:remote     # Same, but binds Vite to 0.0.0.0 so you can open the remote control UI from other devices on your LAN
pnpm build          # Build all packages
pnpm test           # Run all tests
pnpm lint           # Lint all packages
pnpm type-check     # TypeScript checks
pnpm storybook      # Run Storybook
```

## Community

- [Discord](https://discord.gg/JqPjKxE)
- [Mastodon](https://fosstodon.org/@nuclearplayer)
- [Discussions](https://github.com/nukeop/nuclear/discussions)

## License

AGPL-3.0. See [LICENSE](LICENSE).
