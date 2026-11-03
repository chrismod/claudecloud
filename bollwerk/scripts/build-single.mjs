// Baut Bollwerk als eine einzige HTML-Datei (three.js eingebettet) – zum Hochladen auf jeden Webserver.
//   npm run build:single   → dist-single/bollwerk.html
//   npm run build:artifact → dist-single/bollwerk-artifact.html (Seiteninhalt ohne eigenes <html>/<head>, für claude.ai-Artifacts)
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

const artifact = process.argv.includes('--artifact');
const pick = (re) => head.match(re)?.[0] || '';
const fragment = `${pick(/<title>[^<]*<\/title>/)}
${pick(/<meta name="description"[^>]*>/)}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${pick(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/)}
<style>${css}</style>
${body}
<script type="module">${js}</script>
`;
const out = artifact ? fragment : `<!doctype html>
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
const name = artifact ? 'bollwerk-artifact.html' : 'bollwerk.html';
writeFileSync(`dist-single/${name}`, out);
console.log(`dist-single/${name} (${(out.length / 1024).toFixed(0)} KB, three.js eingebettet)`);
