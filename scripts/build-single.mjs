// Baut Filatura als eine einzige HTML-Seite (three.js kommt per Import-Map vom CDN).
// Ergebnis: dist-single/filatura.html – z. B. zum Veröffentlichen als claude.ai-Artifact.
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const THREE_VERSION = JSON.parse(readFileSync('node_modules/three/package.json', 'utf8')).version;
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;
const outDir = 'dist-single/tmp';

await build({
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: { external: (id) => id === 'three' || id.startsWith('three/') },
  },
});

const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');
const html = readFileSync('index.html', 'utf8');

const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const fonts = head.match(/<link\s+href="https:\/\/fonts\.googleapis\.com[^>]*>/s)[0];
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '');

if (js.includes('</script')) throw new Error('Bundle enthält </script>');
const importMap = {
  imports: { three: `${CDN}/build/three.module.js`, 'three/examples/jsm/': `${CDN}/examples/jsm/` },
};

const out = `<title>Filatura</title>
<meta name="description" content="Filatura – ein Physik-Puzzle mit Käsefäden." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fonts}
<script type="importmap">${JSON.stringify(importMap)}</script>
<style>${css}</style>
${body.trim()}
<script type="module">${js}</script>
`;
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/filatura.html', out);
console.log(`dist-single/filatura.html (${(out.length / 1024).toFixed(0)} KB, three@${THREE_VERSION} vom CDN)`);
