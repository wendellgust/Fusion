const webPluginFiles = new Map<string, Map<string, string>>();

export function storeWebPluginFiles(
  pluginId: string,
  files: Map<string, string>,
) {
  webPluginFiles.set(pluginId, files);
  try {
    const obj: Record<string, string> = {};
    files.forEach((v, k) => (obj[k] = v));
    localStorage.setItem(
      `nuclear_web_plugin:${pluginId}`,
      JSON.stringify(obj),
    );
  } catch {
    // ignore localStorage errors
  }
}

export function getWebPluginFiles(pluginId: string): Map<string, string> {
  let map = webPluginFiles.get(pluginId);
  if (!map) {
    map = new Map();
    try {
      const raw = localStorage.getItem(`nuclear_web_plugin:${pluginId}`);
      if (raw) {
        const obj = JSON.parse(raw);
        Object.entries(obj).forEach(([k, v]) => map!.set(k, String(v)));
      }
    } catch {
      // ignore
    }
    webPluginFiles.set(pluginId, map);
  }
  return map;
}

export function getWebPluginFile(
  pluginId: string,
  filePath: string,
): string | null {
  const map = getWebPluginFiles(pluginId);
  if (!map || map.size === 0) return null;

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
    const val = map.get(cand);
    if (val !== undefined && val !== null) {
      return val;
    }
  }

  return null;
}
