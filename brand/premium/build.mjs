// Coinside premium brand set: the "Two sides" mark with a coin rim and a platinum face, an X profile picture
// and an X header. Writes SVG sources and PNG renders into brand/premium.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/user/flipside/apps/web/package.json');
const sharp = require('sharp');
const out = process.argv[2] ?? new URL('.', import.meta.url).pathname;

const GREEN = '#3DD68C',
  RED = '#FF5F5F',
  T1 = '#EDEDED';

// the mark on a 64 grid, centered at (32,32); id keeps masks unique per file
function mark(id, { color = false, rim = true } = {}) {
  const face = color
    ? `<g mask="url(#m${id})"><rect x="0" y="0" width="32" height="64" fill="url(#gl${id})"/><rect x="32" y="0" width="32" height="64" fill="url(#gr${id})"/></g>`
    : `<circle cx="32" cy="32" r="26.5" fill="url(#pt${id})" mask="url(#m${id})"/>`;
  return `
  <defs>
    <linearGradient id="pt${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF"/><stop offset=".55" stop-color="#E4E4E4"/><stop offset="1" stop-color="#A9A9A9"/>
    </linearGradient>
    <linearGradient id="gl${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6BF0B0"/><stop offset="1" stop-color="${GREEN}"/>
    </linearGradient>
    <linearGradient id="gr${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${RED}"/><stop offset="1" stop-color="#D93F48"/>
    </linearGradient>
    <linearGradient id="rim${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".12"/>
    </linearGradient>
    <mask id="m${id}">
      <circle cx="32" cy="32" r="26.5" fill="#fff"/>
      <rect x="30.6" y="0" width="2.8" height="64" fill="#000"/>
      <path d="M13 36.2L19.2 28.6L25.4 36.2M38.6 27.8L44.8 35.4L51 27.8" stroke="#000" stroke-width="4.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </mask>
  </defs>
  ${rim ? `<circle cx="32" cy="32" r="30.2" fill="none" stroke="url(#rim${id})" stroke-width="1.2"/>` : ''}
  ${face}`;
}

const svgDoc = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

const files = {};
// 1. the mark alone (transparent), mono and color
files['mark.svg'] = svgDoc(64, 64, mark('a'));
files['mark-color.svg'] = svgDoc(64, 64, mark('b', { color: true }));
// 2. lockup: mark + wordmark
const lock = (id, color) => `
  <g transform="translate(0 0)">${mark(id, { color })}</g>
  <text x="80" y="44" font-family="Inter" font-weight="600" font-size="38" letter-spacing="-0.95" fill="${T1}">Coinside</text>`;
files['lockup.svg'] = svgDoc(260, 64, lock('c', false));
files['lockup-color.svg'] = svgDoc(260, 64, lock('d', true));

// 3. X profile picture 400x400 (X crops it to a circle)
const pfp = (color) => `
  <rect width="400" height="400" fill="#000"/>
  <g transform="translate(200 200) scale(4.9) translate(-32 -32)">${mark(color ? 'p2' : 'p1', { color })}</g>`;
files['x-profile.svg'] = svgDoc(400, 400, pfp(false));
files['x-profile-color.svg'] = svgDoc(400, 400, pfp(true));

// 4. X header 1500x500: the line, the domain, and a chart split down the middle like the mark
function candles() {
  const out = [];
  const split = 1170;
  const n = 11;
  // left: a market going up (long); right: the mirror, going down (short)
  let px = 330;
  for (let i = 0; i < n; i++) {
    const x = 830 + i * 29;
    const o = px,
      c = px - (14 + ((i * 7) % 11));
    const hi = Math.min(o, c) - 8 - (i % 3) * 3,
      lo = Math.max(o, c) + 7 + (i % 2) * 4;
    const red = i === 3 || i === 7;
    const top = red ? o - 6 : c,
      bot = red ? o + 8 : o;
    out.push(
      `<line x1="${x + 7}" y1="${hi}" x2="${x + 7}" y2="${lo}" stroke="${red ? RED : GREEN}" stroke-width="2" opacity=".9"/>`,
    );
    out.push(
      `<rect x="${x}" y="${Math.min(top, bot)}" width="14" height="${Math.abs(bot - top) || 3}" rx="2" fill="${red ? RED : GREEN}"/>`,
    );
    px = red ? o + 4 : c;
  }
  px = 175;
  for (let i = 0; i < 9; i++) {
    const x = split + 26 + i * 28;
    const o = px,
      c = px + (13 + ((i * 5) % 10));
    const hi = Math.min(o, c) - 7 - (i % 2) * 4,
      lo = Math.max(o, c) + 8 + (i % 3) * 3;
    const green = i === 2 || i === 6;
    const top = green ? o - 8 : o,
      bot = green ? o + 4 : c;
    out.push(
      `<line x1="${x + 7}" y1="${hi}" x2="${x + 7}" y2="${lo}" stroke="${green ? GREEN : RED}" stroke-width="2" opacity=".9"/>`,
    );
    out.push(
      `<rect x="${x}" y="${Math.min(top, bot)}" width="14" height="${Math.abs(bot - top) || 3}" rx="2" fill="${green ? GREEN : RED}"/>`,
    );
    px = green ? o - 3 : c;
  }
  return out.join('');
}
const grid = [];
for (let y = 70; y <= 440; y += 62)
  grid.push(`<line x1="800" y1="${y}" x2="1460" y2="${y}" stroke="#151515" stroke-width="1"/>`);
for (let x = 800; x <= 1460; x += 82.5)
  grid.push(`<line x1="${x}" y1="60" x2="${x}" y2="450" stroke="#101010" stroke-width="1"/>`);
const header = `
  <rect width="1500" height="500" fill="#000"/>
  <defs>
    <radialGradient id="glow" cx="1170" cy="250" r="420" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".05"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1500" height="500" fill="url(#glow)"/>
  ${grid.join('')}
  <line x1="1170" y1="48" x2="1170" y2="460" stroke="#3A3A3A" stroke-width="2" stroke-dasharray="2 6"/>
  <text x="830" y="92" font-family="Geist Mono" font-size="15" letter-spacing="2" fill="${GREEN}">LONG</text>
  <text x="1420" y="92" text-anchor="end" font-family="Geist Mono" font-size="15" letter-spacing="2" fill="${RED}">SHORT</text>
  ${candles()}
  <g transform="translate(110 92) scale(1.05)">${mark('h', { color: false })}</g>
  <text x="190" y="138" font-family="Inter" font-weight="600" font-size="40" letter-spacing="-1" fill="${T1}">Coinside</text>
  <text x="110" y="232" font-family="Inter" font-weight="600" font-size="52" letter-spacing="-2" fill="${T1}">Every coin has two sides.</text>
  <text x="110" y="294" font-family="Inter" font-weight="600" font-size="52" letter-spacing="-2" fill="#6E6E6E">Pick one.</text>
  <text x="110" y="348" font-family="Inter" font-weight="400" font-size="20" fill="#A1A1A1">Long or short on Hyperliquid, straight from your Solana wallet.</text>
  <text x="1420" y="480" text-anchor="end" font-family="Geist Mono" font-size="17" letter-spacing=".5" fill="#A1A1A1">coinside.fun</text>`;
files['x-header.svg'] = svgDoc(1500, 500, header);
// 5. the lockup on black, for posts and slides
files['lockup-on-black.svg'] = svgDoc(
  1200,
  400,
  `<rect width="1200" height="400" fill="#000"/><g transform="translate(340 136) scale(2)">${lock('e', false)}</g>`,
);

for (const [name, svg] of Object.entries(files)) writeFileSync(`${out}/${name}`, svg);
const png = async (name, w, h) =>
  sharp(Buffer.from(files[name]), { density: 300 })
    .resize(w, h)
    .png()
    .toFile(`${out}/${name.replace('.svg', '.png')}`);
await png('x-header.svg', 1500, 500);
await png('x-profile.svg', 400, 400);
await png('x-profile-color.svg', 400, 400);
await png('lockup.svg', 1040, 256);
await png('lockup-color.svg', 1040, 256);
await png('mark.svg', 512, 512);
await png('mark-color.svg', 512, 512);
await png('lockup-on-black.svg', 1200, 400);
console.log('ok');
