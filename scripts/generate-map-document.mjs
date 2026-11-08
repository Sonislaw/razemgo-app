import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const browser = readFileSync('src/features/discovery/map/map-browser.js', 'utf8');
const images = Object.fromEntries(Object.entries({
  Kamper: 'motorhome', Van: 'van', Przyczepa: 'caravan', Samochód: 'car', Namiot: 'tent',
}).map(([mode, file]) => [mode, 'data:image/webp;base64,' +
  readFileSync('assets/images/travel-modes/' + file + '.webp').toString('base64')]));
const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com data: blob:; script-src 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com; connect-src https://*.googleapis.com https://*.gstatic.com https://*.google.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; worker-src blob:; base-uri 'none'; form-action 'none'">
<title>Mapa wyjazdów RazemGo</title><style>
html,body,#map{margin:0;width:100%;height:100%;overflow:hidden;background:#EAF5F8;font-family:Arial,sans-serif}
.crew-pin,.crew-cluster{position:absolute;transform:translate(-50%,-50%);padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center;width:42px;height:42px;background:#086996;color:white;border:3px solid white;border-radius:50%;box-sizing:border-box;box-shadow:0 2px 8px #24384244;font-weight:700;font-size:16px}
.crew-pin{width:48px;height:48px;background:#EAF5F8;color:#086996;border-width:2px;font-size:24px}
.crew-pin img{width:100%;height:100%;object-fit:contain;border-radius:50%;pointer-events:none;user-select:none;-webkit-user-drag:none}
.crew-pin:focus,.crew-cluster:focus{outline:3px solid #FE881E;outline-offset:3px}
#hint{position:absolute;top:45%;left:10%;right:10%;text-align:center;color:#344952}
</style></head><body><div id="map" role="application" aria-label="Mapa wyjazdów"></div><p id="hint">Wczytywanie mapy…</p><script type="application/json" id="travel-mode-images">${JSON.stringify(images)}</script><script>${browser}</script></body></html>`;
const outputs = { 'public/razemgo-map.html': html };
for (const [path, text] of Object.entries(outputs)) {
  if (process.argv.includes('--check')) {
    if (readFileSync(path, 'utf8') !== text) throw Error('Map document differs: ' + path);
  } else { mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true }); writeFileSync(path, text); }
}
console.log('Google map document verified; SHA-256 ' + createHash('sha256').update(html).digest('hex'));
