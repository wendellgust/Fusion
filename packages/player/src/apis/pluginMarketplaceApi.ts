import { z } from 'zod';

import { ApiClient } from './ApiClient';

const PluginCategorySchema = z.enum([
  'streaming',
  'metadata',
  'lyrics',
  'scrobbling',
  'dashboard',
  'playlists',
  'discovery',
  'other',
]);

const MarketplacePluginSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  author: z.string().min(1),
  repo: z.string().regex(/^[^/]+\/[^/]+$/),
  category: PluginCategorySchema.optional(),
  categories: z.array(PluginCategorySchema).optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().min(1).optional(),
  downloadUrl: z.url().optional(),
  addedAt: z.iso.datetime(),
});

const RegistrySchema = z.object({
  $schema: z.string().optional(),
  version: z.number(),
  plugins: z.array(MarketplacePluginSchema),
});

const GitHubReleaseSchema = z.object({
  tag_name: z.string(),
  name: z.string().optional(),
  published_at: z.string().optional(),
  assets: z.array(
    z.object({
      name: z.string(),
      browser_download_url: z.string(),
      size: z.number().optional(),
    }),
  ).optional(),
});

export type MarketplacePlugin = z.infer<typeof MarketplacePluginSchema>;

export type PluginRelease = {
  version: string;
  name: string;
  publishedAt: string;
  downloadUrl: string;
  size: number;
};

const PLUGIN_ASSET_NAME = 'plugin.zip';

class PluginRegistryApi extends ApiClient {
  constructor() {
    super('https://cdn.jsdelivr.net/gh/NuclearPlayer/plugin-registry@master');
  }

  async getPlugins(): Promise<MarketplacePlugin[]> {
    const registry = await this.fetch('/plugins.json', RegistrySchema);
    return registry.plugins;
  }
}

class GitHubReleasesApi extends ApiClient {
  constructor() {
    super('https://api.github.com');
  }

  async getLatestRelease(repo: string): Promise<PluginRelease> {
    if (!/^[^/]+\/[^/]+$/.test(repo)) {
      throw new Error(`Invalid repo format: ${repo}`);
    }

    const githubUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const proxyUrl = `/api/proxy-download?url=${encodeURIComponent(githubUrl)}`;

    let releaseData: any;
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        releaseData = await res.json();
      } else {
        releaseData = await this.fetch(
          `/repos/${repo}/releases/latest`,
          GitHubReleaseSchema,
        );
      }
    } catch {
      releaseData = await this.fetch(
        `/repos/${repo}/releases/latest`,
        GitHubReleaseSchema,
      );
    }

    const assets = releaseData.assets || [];
    const asset =
      assets.find((a: any) => a.name === PLUGIN_ASSET_NAME) ||
      assets.find((a: any) => a.name?.endsWith('.zip')) ||
      assets[0];

    const tagName = releaseData.tag_name || '1.0.0';
    const downloadUrl = asset
      ? asset.browser_download_url
      : `https://github.com/${repo}/archive/refs/tags/${tagName}.zip`;

    return {
      version: tagName.replace(/^v/i, ''),
      name: releaseData.name || repo,
      publishedAt: releaseData.published_at || new Date().toISOString(),
      downloadUrl,
      size: asset?.size || 0,
    };
  }
}

class PluginMarketplaceApi {
  private registry = new PluginRegistryApi();
  private releases = new GitHubReleasesApi();

  getPlugins() {
    return this.registry.getPlugins();
  }

  getLatestRelease(repo: string) {
    return this.releases.getLatestRelease(repo);
  }
}

export const pluginMarketplaceApi = new PluginMarketplaceApi();
