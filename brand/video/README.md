# Coinside promo video

A 44-second 1080p ad that walks through Coinside's features on the real live edition (with sample market data
from the e2e mocks), with an original soundtrack. The MP4 and the screens are rebuilt, not committed.

1. Screens: build the live edition, then drive it with the e2e mocks.

   ```bash
   cd apps/web && pnpm build && pnpm exec playwright test --config video/playwright.config.ts
   ```

2. Picture: `promo.html` animates the screens (open it with `?t=12` to see one moment); `render.mjs` steps it
   frame by frame into ffmpeg.

   ```bash
   node brand/video/render.mjs brand/video/coinside-promo-silent.mp4
   ```

3. Sound: `music.py` synthesizes the track and the sound effects (A minor, 120 BPM; the coin closing, scene
   changes, cursor clicks, the deposit arriving, "Free"), timed to `promo.html`. Needs numpy and scipy.

   ```bash
   python3 brand/video/music.py music.wav
   ```

4. Together, at -14 LUFS (what X and YouTube play at):

   ```bash
   ffmpeg -i brand/video/coinside-promo-silent.mp4 -i music.wav -map 0:v -map 1:a -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 -c:a aac -b:a 192k -shortest -movflags +faststart brand/video/coinside-promo.mp4
   ```

If a scene's timing changes in `promo.html`, move its sound in `music.py` with it.
