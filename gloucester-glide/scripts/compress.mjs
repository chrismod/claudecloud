// Legt neben jeder Datei in dist/ vorkomprimierte .br- und .gz-Fassungen ab (der Server liefert sie aus)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const root = path.resolve('dist');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
let saved = 0;
for (const file of walk(root)) {
  if (!/\.(js|css|html|svg|json|wasm)$/.test(file)) continue;
  const buf = fs.readFileSync(file);
  if (buf.length < 1024) continue;
  const br = zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } });
  fs.writeFileSync(`${file}.br`, br);
  fs.writeFileSync(`${file}.gz`, zlib.gzipSync(buf, { level: 9 }));
  saved += buf.length - br.length;
}
console.log(`vorkomprimiert, ${(saved / 1e6).toFixed(1)} MB gespart`);
