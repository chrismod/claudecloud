// Baut Bollwerk als eine einzige HTML-Datei (three.js eingebettet) – zum Hochladen auf jeden Webserver.
//   npm run build:single   → dist-single/bollwerk.html
import { build } from 'vite';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const outDir = 'dist-single/tmp';
await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true, modulePreload: false } });

const assets = join(outDir, 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const css = readFileSync(join(assets, files.find((f) => f.endsWith('.css'))), 'utf8');
rmSync(outDir, { recursive: true, force: true });
if (js.includes('</script')) throw new Error('Bundle enthält </script>');

const html = readFileSync('index.html', 'utf8');
const head = html
  .slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .trim();
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

const out = `<!doctype html>
<html lang="de">
<head>
${head}
<style>${css}</style>
</head>
<body>
${body}
<script type="module">${js}</script>
</body>
</html>
`;
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/bollwerk.html', out);
console.log(`dist-single/bollwerk.html (${(out.length / 1024).toFixed(0)} KB, three.js eingebettet)`);
