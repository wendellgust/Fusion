import { join } from '@tauri-apps/api/path';
import { readTextFile } from '@tauri-apps/plugin-fs';
import * as esbuild from 'esbuild-wasm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';

import { NuclearPluginAPI } from '@nuclearplayer/plugin-sdk';
import type {
  LoadedPlugin,
  NuclearPlugin,
  PluginManifest,
  PluginMetadata,
} from '@nuclearplayer/plugin-sdk';
import * as nuclearUI from '@nuclearplayer/ui';

import { Logger } from '../logger';
import { compilePlugin } from './pluginCompiler';
import { safeParsePluginManifest } from './pluginManifest';
import { getWebPluginFile, getWebPluginFiles } from './webPluginStorage';

let esbuildInitPromise: Promise<void> | null = null;

async function ensureEsbuildInitialized(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (esbuildInitPromise) return esbuildInitPromise;

  esbuildInitPromise = (async () => {
    try {
      await esbuild.initialize({
        wasmURL: '/assets/esbuild.wasm',
        worker: false,
      });
    } catch {
      /* ignore if already initialized */
    }
  })();

  return esbuildInitPromise;
}

async function compileWebPluginCode(code: string, filename: string): Promise<string> {
  if (!code || !code.trim()) return code;

  try {
    await ensureEsbuildInitialized();
    const loader = filename.endsWith('.tsx')
      ? 'tsx'
      : filename.endsWith('.ts')
        ? 'ts'
        : 'js';
    const result = await esbuild.transform(code, {
      loader,
      format: 'cjs',
      target: 'es2022',
    });
    return result.code;
  } catch (err) {
    Logger.plugins.error(
      `esbuild.transform failed for web plugin ${filename}: ${err}`,
    );
    return transpileWebPluginFallback(code);
  }
}

function transpileWebPluginFallback(code: string): string {
  let result = code;
  result = result.replace(/import\s+type\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?/g, '');
  result = result.replace(/import\s+type\s+\w+\s+from\s+['"][^'"]+['"];?/g, '');
  result = result.replace(/export\s+interface\s+\w+[\s\S]*?\{[\s\S]*?\}/g, '');
  result = result.replace(/interface\s+\w+[\s\S]*?\{[\s\S]*?\}/g, '');
  result = result.replace(/export\s+type\s+\w+\s*=[^;]+;/g, '');
  result = result.replace(/type\s+\w+\s*=[^;]+;/g, '');
  result = result.replace(/implements\s+[a-zA-Z0-9_$,\s]+/g, '');

  result = result.replace(/export\s+default\s+/g, 'module.exports.default = ');
  result = result.replace(/export\s+async\s+function\s+([a-zA-Z0-9_$]+)/g, 'async function $1');
  result = result.replace(/export\s+function\s+([a-zA-Z0-9_$]+)/g, 'function $1');
  result = result.replace(/export\s+class\s+([a-zA-Z0-9_$]+)/g, 'class $1');
  result = result.replace(
    /export\s+(const|let|var)\s+([a-zA-Z0-9_$]+)/g,
    '$1 $2 = module.exports.$2',
  );

  result = result.replace(
    /import\s*\{\s*([\s\S]*?)\s*\}\s+from\s+['"]([^'"]+)['"];?/g,
    (_, imports, mod) => `const { ${imports} } = require('${mod}');`,
  );
  result = result.replace(
    /import\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"];?/g,
    (_, name, mod) =>
      `const ${name} = require('${mod}').default || require('${mod}');`,
  );
  result = result.replace(
    /import\s+\*\s+as\s+([a-zA-Z0-9_$]+)\s+from\s+['"]([^'"]+)['"];?/g,
    (_, name, mod) => `const ${name} = require('${mod}');`,
  );

  result = result.replace(/:\s*[A-Z][a-zA-Z0-9_$.<>[\]\s|&]*(?=\s*[:=,);{}]|$)/g, '');
  result = result.replace(/\s+as\s+[a-zA-Z0-9_$.<>[\]]+/g, '');

  if (!result.includes('module.exports')) {
    result += '\nmodule.exports = typeof YoutubePlugin !== "undefined" ? YoutubePlugin : exports.default;';
  }
  return result;
}

function resolveRelativePath(baseFile: string, relativePath: string): string {
  const parts = baseFile.split('/');
  parts.pop(); // remove current filename

  const relParts = relativePath.split('/');
  for (const p of relParts) {
    if (p === '.' || p === '') continue;
    if (p === '..') {
      parts.pop();
    } else {
      parts.push(p);
    }
  }
  return parts.join('/');
}

export class PluginLoader {
  private path: string;
  private manifest?: PluginManifest;
  private entryPath?: string;
  private pluginCode?: string;
  private warnings: string[] = [];
  private compiledWebFiles = new Map<string, string>();

  constructor(path: string) {
    this.path = path;
  }

  private getCompiledWebFile(filePath: string): string | null {
    const cleanPath = filePath
      .replace(/\\/g, '/')
      .replace(/^.*plugins\//, '')
      .replace(/^web_plugin:[^/]+\/?/, '')
      .replace(/^\.\//, '');

    const withoutSrc = cleanPath.replace(/^src\//, '');
    const withSrc = `src/${withoutSrc}`;

    const candidates = [
      cleanPath,
      withoutSrc,
      withSrc,
      filePath,
      `${cleanPath}.ts`,
      `${cleanPath}.js`,
      `${cleanPath}.tsx`,
      `${withoutSrc}.ts`,
      `${withoutSrc}.js`,
      `${withoutSrc}.tsx`,
      `${withSrc}.ts`,
      `${withSrc}.js`,
      `${withSrc}.tsx`,
      `${cleanPath}/index.ts`,
      `${cleanPath}/index.js`,
      `${withoutSrc}/index.ts`,
      `${withoutSrc}/index.js`,
    ];

    for (const cand of candidates) {
      if (this.compiledWebFiles.has(cand)) {
        return this.compiledWebFiles.get(cand)!;
      }
    }

    return null;
  }

  private async readRawPackageJson(): Promise<unknown> {
    if (this.path.startsWith('web_plugin:')) {
      const pluginId = this.path.replace('web_plugin:', '');
      const content = getWebPluginFile(pluginId, 'package.json');
      if (content) {
        return JSON.parse(content);
      }
      return { name: pluginId, version: '1.0.0' };
    }
    const packageJsonPath = await join(this.path, 'package.json');
    Logger.plugins.debug(`Reading package.json from ${packageJsonPath}`);
    const packageJsonContent = await readTextFile(packageJsonPath);
    return JSON.parse(packageJsonContent);
  }

  private async readManifest(): Promise<PluginManifest> {
    const raw = await this.readRawPackageJson();
    const res = safeParsePluginManifest(raw);
    if (!res.success) {
      const msg = res.errors.join('; ');
      Logger.plugins.error(`Invalid package.json at ${this.path}: ${msg}`);
      throw new Error(`Invalid package.json: ${msg}`);
    }
    this.warnings = res.warnings;
    this.manifest = res.data;
    Logger.plugins.debug(
      `Parsed manifest for ${this.manifest.name}@${this.manifest.version}`,
    );
    return this.manifest;
  }

  private buildMetadata(manifest: PluginManifest): PluginMetadata {
    return {
      id: manifest.name,
      name: manifest.name,
      displayName: manifest.nuclear?.displayName || manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      category: manifest.nuclear?.category,
      categories: manifest.nuclear?.categories ?? [],
      icon: manifest.nuclear?.icon,
      permissions: manifest.nuclear?.permissions || [],
    };
  }

  private async resolveEntryPath(manifest: PluginManifest): Promise<string> {
    if (this.path.startsWith('web_plugin:')) {
      const pluginId = this.path.replace('web_plugin:', '');
      if (manifest.main && getWebPluginFile(pluginId, manifest.main)) {
        return manifest.main;
      }
      const candidates = [
        'src/index.ts',
        'src/index.js',
        'dist/index.js',
        'dist/index.ts',
        'index.js',
        'index.ts',
        'index.tsx',
      ];
      for (const cand of candidates) {
        if (getWebPluginFile(pluginId, cand)) {
          return cand;
        }
      }
      return manifest.main || 'src/index.ts';
    }

    if (manifest.main) {
      const entryPath = await join(this.path, manifest.main);
      Logger.plugins.debug(`Entry path from manifest.main: ${entryPath}`);
      return entryPath;
    }
    const candidates = [
      'index.js',
      'index.ts',
      'index.tsx',
      'dist/index.js',
      'dist/index.ts',
      'dist/index.tsx',
    ];
    for (const candidate of candidates) {
      try {
        const full = await join(this.path, candidate);
        await readTextFile(full);
        Logger.plugins.debug(`Entry path resolved to ${full}`);
        return full;
      } catch {
        /* Do nothing */
      }
    }
    Logger.plugins.error(
      `Could not resolve entry file for plugin at ${this.path}`,
    );
    throw new Error(
      'Could not resolve plugin entry file (main, index.js, index.ts, index.tsx, dist/index.js, dist/index.ts, dist/index.tsx)',
    );
  }

  private async compileAllWebFiles(pluginId: string): Promise<void> {
    const files = getWebPluginFiles(pluginId);
    const entries = Array.from(files.entries());
    for (const [filename, rawCode] of entries) {
      if (filename.endsWith('.ts') || filename.endsWith('.tsx') || filename.endsWith('.js')) {
        try {
          const compiled = await compileWebPluginCode(rawCode, filename);
          this.compiledWebFiles.set(filename, compiled);
        } catch {
          this.compiledWebFiles.set(filename, transpileWebPluginFallback(rawCode));
        }
      }
    }
  }

  private async readPluginCode(entryPath: string): Promise<string> {
    if (this.path.startsWith('web_plugin:')) {
      const pluginId = this.path.replace('web_plugin:', '');
      await this.compileAllWebFiles(pluginId);
      const compiled =
        this.getCompiledWebFile(entryPath) ||
        this.getCompiledWebFile('src/index.ts') ||
        getWebPluginFile(pluginId, entryPath) ||
        '';
      this.pluginCode = compiled;
      return compiled;
    }

    Logger.plugins.debug(`Compiling plugin from ${entryPath}`);
    const compiled = await compilePlugin(entryPath);
    if (compiled != null) {
      Logger.plugins.debug(
        `Plugin compiled successfully (${compiled.length} chars)`,
      );
      this.pluginCode = compiled;
      return compiled;
    }
    Logger.plugins.debug(`Reading pre-compiled plugin code from ${entryPath}`);
    this.pluginCode = await readTextFile(entryPath);
    return this.pluginCode;
  }

  private evaluatePlugin(code: string, currentFile = 'src/index.ts'): NuclearPlugin {
    Logger.plugins.debug(`Evaluating plugin code for ${currentFile}`);
    const exports = {} as Record<string, unknown>;
    const module = { exports } as { exports: unknown };
    const evaluatedModules = new Map<string, unknown>();
    const isWebPlugin = this.path.startsWith('web_plugin:');
    const pluginId = isWebPlugin ? this.path.replace('web_plugin:', '') : '';

    const makeRequire = (activeFile: string) => {
      const requireSync = (id: string): any => {
        const ALLOWED_MODULES: Record<string, unknown> = {
          '@nuclearplayer/plugin-sdk': { NuclearPluginAPI },
          '@nuclearplayer/ui': nuclearUI,
          react: React,
          'react/jsx-runtime': jsxRuntime,
        };

        if (id in ALLOWED_MODULES) {
          return ALLOWED_MODULES[id];
        }

        if (isWebPlugin && (id.startsWith('./') || id.startsWith('../'))) {
          const resolvedPath = resolveRelativePath(activeFile, id);
          const compiledCode = this.getCompiledWebFile(resolvedPath);
          const rawCode = compiledCode || getWebPluginFile(pluginId, resolvedPath);

          if (rawCode !== undefined && rawCode !== null) {
            if (evaluatedModules.has(resolvedPath)) {
              return evaluatedModules.get(resolvedPath);
            }

            const codeToEval = compiledCode || transpileWebPluginFallback(rawCode);
            const relExports = {} as Record<string, unknown>;
            const relModule = { exports: relExports };

            evaluatedModules.set(resolvedPath, relModule.exports);

            try {
              const childRequire = makeRequire(resolvedPath);
              new Function('exports', 'module', 'require', codeToEval)(
                relExports,
                relModule,
                childRequire,
              );
              const res = relModule.exports;
              evaluatedModules.set(resolvedPath, res);
              return res;
            } catch (e) {
              Logger.plugins.error(`Error evaluating relative web file ${resolvedPath} from ${activeFile}: ${e}`);
              throw e;
            }
          }
        }

        Logger.plugins.error(`Plugin tried to require unknown module: ${id} from ${activeFile}`);
        throw new Error(`Module ${id} not found`);
      };

      return requireSync;
    };

    const rootRequire = makeRequire(currentFile);

    try {
      new Function('exports', 'module', 'require', code)(
        exports,
        module,
        rootRequire,
      );
    } catch (error) {
      Logger.plugins.error(
        `Plugin evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
    const rawInstance =
      (module.exports as { default?: unknown }).default ||
      module.exports;
    const pluginInstance =
      typeof rawInstance === 'function' ? new (rawInstance as any)() : rawInstance;

    if (!pluginInstance) {
      Logger.plugins.error(
        'Plugin module.exports.default is missing or invalid',
      );
      throw new Error(
        'Invalid plugin: must export a default object implementing NuclearPlugin interface',
      );
    }
    return pluginInstance as NuclearPlugin;
  }

  async loadMetadata(): Promise<PluginMetadata> {
    const manifest = await this.readManifest();
    this.entryPath = await this.resolveEntryPath(manifest);
    return this.buildMetadata(manifest);
  }

  async load(api: NuclearPluginAPI): Promise<LoadedPlugin> {
    if (!this.manifest || !this.entryPath) {
      await this.loadMetadata();
    }
    const metadata = this.buildMetadata(this.manifest!);
    const code = await this.readPluginCode(this.entryPath!);
    const instance = this.evaluatePlugin(code, this.entryPath || 'src/index.ts');
    if (instance.onLoad) {
      Logger.plugins.debug(`Calling onLoad for ${metadata.id}`);
      await instance.onLoad(api);
    }
    return { metadata, instance, path: this.path };
  }

  getWarnings(): string[] {
    return this.warnings;
  }
}
