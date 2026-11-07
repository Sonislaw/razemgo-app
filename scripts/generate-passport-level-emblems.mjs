import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'assets/images/passport/level-emblems');
const catalog = JSON.parse(readFileSync(join(root, 'shared/passport-catalog.json'), 'utf8'));
const digits = JSON.parse(readFileSync(join(output, 'number-paths.json'), 'utf8'));

const outer = 'M276 22 476 148Q494 159 494 183V414Q494 438 475 450L277 577Q256 590 235 577L37 450Q18 438 18 414V183Q18 159 37 148L236 22Q256 9 276 22Z';
const face = 'M272 52 460 170Q470 176 470 192V404Q470 420 457 428L270 548Q256 557 242 548L55 428Q42 420 42 404V192Q42 176 53 170L240 52Q256 42 272 52Z';
const forest = 'M269 65 454 182Q459 186 459 196V400Q459 411 450 416L266 535Q256 541 246 535L62 416Q53 411 53 400V196Q53 186 61 182L243 65Q256 57 269 65Z';

function fir(x, y, scale, color, light) {
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <path d="M0 0C-4 24-12 40-22 52L-9 49C-17 69-30 86-43 98L-23 94C-36 117-50 134-65 145L-33 139-38 165 0 159 38 165 33 139 65 145C50 134 36 117 23 94L43 98C30 86 17 69 9 49L22 52C12 40 4 24 0 0Z" fill="${color}"/>
    <path d="M0 5-4 48-20 52-7 49-9 90-36 100-16 95-18 135-51 146-22 139-25 160 0 156Z" fill="${light}" opacity=".65"/>
    <path d="M-3 150H3V174H-3Z" fill="#073C28"/>
  </g>`;
}

function leaves() {
  return `<g>
    <path d="M247 542C204 502 152 477 77 454" fill="none" stroke="#173C10" stroke-width="9" stroke-linecap="round"/>
    <path d="M224 523C166 525 72 504 40 403 102 424 172 404 224 523Z" fill="url(#leaf)" stroke="#7EAE1C" stroke-width="2"/>
    <path d="M221 521C156 497 100 456 40 403 116 441 160 462 221 521Z" fill="url(#leafLight)"/>
    <path d="m190 503-47-3-30-45m55 31-13-43m-25 29-48-6" fill="none" stroke="#C2E351" stroke-opacity=".5" stroke-width="3"/>
    <path d="M218 519C191 486 165 482 156 455 192 455 222 471 247 542Z" fill="url(#leafSmall)"/>
    <path d="M247 542C222 508 200 485 158 456" fill="none" stroke="#8EBE30" stroke-width="3"/>
    <g transform="translate(512 0) scale(-1 1)">
      <path d="M247 542C204 502 152 477 77 454" fill="none" stroke="#173C10" stroke-width="9" stroke-linecap="round"/>
      <path d="M224 523C166 525 72 504 40 403 102 424 172 404 224 523Z" fill="url(#leaf)" stroke="#7EAE1C" stroke-width="2"/>
      <path d="M221 521C156 497 100 456 40 403 116 441 160 462 221 521Z" fill="url(#leafLight)"/>
      <path d="m190 503-47-3-30-45m55 31-13-43m-25 29-48-6" fill="none" stroke="#C2E351" stroke-opacity=".5" stroke-width="3"/>
      <path d="M218 519C191 486 165 482 156 455 192 455 222 471 247 542Z" fill="url(#leafSmall)"/>
      <path d="M247 542C222 508 200 485 158 456" fill="none" stroke="#8EBE30" stroke-width="3"/>
    </g>
  </g>`;
}

function emblem(level) {
  const digit = digits[level];
  if (!digit) throw Error('Missing outlined numeral for level ' + level);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="600" viewBox="0 0 512 600" fill="none">
  <title>Poziom ekipy ${level}</title>
  <defs>
    <linearGradient id="gold" x1="70" y1="70" x2="454" y2="560" gradientUnits="userSpaceOnUse">
      <stop stop-color="#AF6A07"/><stop offset=".15" stop-color="#FFF5A9"/><stop offset=".28" stop-color="#E9AE24"/><stop offset=".5" stop-color="#B57105"/><stop offset=".73" stop-color="#F7D16B"/><stop offset=".9" stop-color="#FFED90"/><stop offset="1" stop-color="#BA7608"/>
    </linearGradient>
    <linearGradient id="goldEdge" x1="54" y1="175" x2="470" y2="440" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF8BB"/><stop offset=".12" stop-color="#EFBF4A"/><stop offset=".45" stop-color="#9D5901"/><stop offset=".7" stop-color="#D39B25"/><stop offset="1" stop-color="#FFDC70"/>
    </linearGradient>
    <linearGradient id="green" x1="120" y1="90" x2="386" y2="520" gradientUnits="userSpaceOnUse">
      <stop stop-color="#428B60"/><stop offset=".48" stop-color="#12613E"/><stop offset="1" stop-color="#013E28"/>
    </linearGradient>
    <radialGradient id="glow" cx=".4" cy=".15" r=".86"><stop stop-color="#9ACF8A" stop-opacity=".24"/><stop offset="1" stop-color="#062B1B" stop-opacity=".55"/></radialGradient>
    <linearGradient id="mountain" x1="140" y1="110" x2="328" y2="308" gradientUnits="userSpaceOnUse"><stop stop-color="#9DCCA5"/><stop offset=".6" stop-color="#3B9A69"/><stop offset="1" stop-color="#17643E"/></linearGradient>
    <linearGradient id="ivory" x1="190" y1="205" x2="325" y2="431" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFFF9"/><stop offset=".6" stop-color="#FAF6E9"/><stop offset="1" stop-color="#E9DCB6"/></linearGradient>
    <linearGradient id="leaf" x1="88" y1="408" x2="185" y2="530" gradientUnits="userSpaceOnUse"><stop stop-color="#D8EE5C"/><stop offset=".35" stop-color="#8BB927"/><stop offset=".75" stop-color="#438017"/><stop offset="1" stop-color="#1A4F15"/></linearGradient>
    <linearGradient id="leafLight" x1="60" y1="410" x2="216" y2="525" gradientUnits="userSpaceOnUse"><stop stop-color="#F4F99C"/><stop offset=".45" stop-color="#B5D946"/><stop offset="1" stop-color="#4C8D1B"/></linearGradient>
    <linearGradient id="leafSmall" x1="157" y1="456" x2="248" y2="542" gradientUnits="userSpaceOnUse"><stop stop-color="#B5DA4B"/><stop offset=".5" stop-color="#508C1B"/><stop offset="1" stop-color="#123E14"/></linearGradient>
    <clipPath id="inside"><path d="${forest}"/></clipPath>
  </defs>
  <path d="${outer}" transform="translate(0 5)" fill="#744609" opacity=".5"/>
  <path d="${outer}" fill="url(#gold)" stroke="#C79124" stroke-width="2"/>
  <path d="${outer}" transform="translate(256 300) scale(.984) translate(-256 -300)" stroke="#FFF1AD" stroke-opacity=".85" stroke-width="2"/>
  <path d="M256 25 477 163M26 185V408M37 438 248 572" stroke="#FFF3A4" stroke-opacity=".72" stroke-width="3" stroke-linecap="round"/>
  <path d="${face}" fill="url(#goldEdge)" stroke="#9C6007" stroke-width="1.5"/>
  <path d="${forest}" fill="url(#green)" stroke="#003822" stroke-width="8"/>
  <g clip-path="url(#inside)">
    <path d="${forest}" fill="url(#glow)"/>
    <path d="M36 237 116 174 135 182 178 142 193 147 260 93Q266 87 272 94L344 166 357 159 400 191 411 188 480 240V328H36Z" fill="url(#mountain)"/>
    <path d="m193 147 67-54q6-6 12 1l72 72-47-25-15-19-13 22-18-18-24 20 12-18-43 39-18-10-29 31 29-46Z" fill="#E7F0CD"/>
    <path d="m272 95-1 26 25 23 48 22-61-58Z" fill="#B9DDBB"/>
    <path d="m116 174-12 47 43-27 31 15 23-13-23-54-43 40Z" fill="#64B17E"/>
    <path d="m272 134-17 54-21 30 41 26 41-54-24-49Z" fill="#17613F" opacity=".7"/>
    <path d="m344 166 13-7 43 32-32-15-11-10-4 14Z" fill="#DCECC5"/>
    <path d="M42 296 150 224 188 254 220 236 303 284 364 241 470 292V477H42Z" fill="#095334" opacity=".42"/>
    ${fir(83, 229, 1.15, '#063D26', '#58A644')}
    ${fir(122, 294, .9, '#003F28', '#217F3C')}
    ${fir(423, 228, 1.13, '#03402A', '#9ED94A')}
    ${fir(458, 286, .9, '#003D27', '#2B8B3E')}
    <path d="M48 418Q248 392 464 420V548H48Z" fill="#003C27" opacity=".28"/>
  </g>
  <path d="${digit}" transform="translate(4 6)" fill="#002D1D" stroke="#002D1D" stroke-width="11" stroke-linejoin="round"/>
  <path d="${digit}" fill="url(#ivory)" stroke="#FFFCEB" stroke-width="2" stroke-linejoin="round"/>
  ${leaves()}
  <path d="M256 446 266 473 288 483 266 493 256 524 246 493 224 483 246 473Z" fill="url(#gold)" stroke="#FCE9A0" stroke-width="1.5"/>
  <path d="M256 447V483H225L246 473Z" fill="#FFF5B1"/>
  <path d="M256 483H287L266 493 256 523Z" fill="#B97C0C"/>
  <path d="M256 448V519M226 483H285" stroke="#FFEFC1" stroke-width="1" opacity=".7"/>
</svg>
`;
}

mkdirSync(output, { recursive: true });
for (const { level } of catalog.levels) {
  const svg = emblem(level);
  writeFileSync(join(output, `level-${level}.svg`), svg);
  console.log(`level-${level}.svg: ${Buffer.byteLength(svg)} bytes`);
}
