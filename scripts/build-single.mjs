// Baut Filatura als eine einzige HTML-Datei.
//
//   npm run build:single   → dist-single/filatura.html
//                            vollständiges Dokument, three.js eingebettet – zum Hochladen auf jeden Webserver
//   npm run build:artifact → dist-single/filatura-artifact.html
//                            Fragment ohne <html>/<head>, three.js per Import-Map vom CDN – für claude.ai-Artifacts
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const artifact = process.argv.includes('--artifact');
const THREE_VERSION = JSON.parse(readFileSync('node_modules/three/package.json', 'utf8')).version;
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_VERSION}`;
const outDir = 'dist-single/tmp';

await build({
  logLevel: 'warn',
  build: {
    outDir,
    emptyOutDir: true,
    modulePreload: false,
    rollupOptions: artifact ? { external: (id) => id === 'three' || id.startsWith('three/') } : {},
  },
});

const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');
rmSync(outDir, { recursive: true, force: true });
if (js.includes('</script')) throw new Error('Bundle enthält </script>');

const html = readFileSync('index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const fonts = head.match(/<link\s+href="https:\/\/fonts\.googleapis\.com[^>]*>/s)[0];
const icon = head.match(/<link\s+rel="icon"[^>]*>/s)[0];
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

const shared = `<title>Filatura</title>
<meta name="description" content="Filatura – ein Physik-Puzzle mit Käsefäden." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${fonts}`;

let out;
let name;
if (artifact) {
  const importMap = { imports: { three: `${CDN}/build/three.module.js`, 'three/examples/jsm/': `${CDN}/examples/jsm/` } };
  name = 'filatura-artifact.html';
  out = `${shared}
<script type="importmap">${JSON.stringify(importMap)}</script>
<style>${css}</style>
${body}
<script type="module">${js}</script>
`;
} else {
  name = 'filatura.html';
  out = `<!doctype html>
<html lang="de">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
${shared}
${icon}
<style>${css}</style>
</head>
<body>
${body}
<script type="module">${js}</script>
</body>
</html>
`;
}
mkdirSync('dist-single', { recursive: true });
writeFileSync(join('dist-single', name), out);
console.log(`dist-single/${name} (${(out.length / 1024).toFixed(0)} KB${artifact ? `, three@${THREE_VERSION} vom CDN` : ', three.js eingebettet'})`);
