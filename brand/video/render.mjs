// Renders promo.html to an MP4: steps render(t) frame by frame in Chromium and pipes the frames to ffmpeg.
//   node brand/video/render.mjs [out.mp4] [--stills 1,9.5,16]
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const stillsAt = args.includes('--stills') ? args[args.indexOf('--stills') + 1].split(',').map(Number) : null;
const out = args[0] && !args[0].startsWith('--') ? args[0] : join(here, 'coinside-promo.mp4');
const FPS = 30;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${join(here, 'promo.html')}`);
await page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map((i) => (i.complete ? null : new Promise((r) => (i.onload = r)))),
  );
});
const duration = await page.evaluate(() => window.DURATION);

if (stillsAt) {
  for (const t of stillsAt) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: join(here, `still-${t}.png`) });
  }
} else {
  const ff = spawn(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-c:v',
      'mjpeg',
      '-i',
      '-',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      '17',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      out,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log('wrote', out);
}
await browser.close();
