# Logo concepts

Six directions for the Flipside mark, for ALFA to choose from. None is applied to the app yet; the header and
favicon still use the prototype's mark (concept 1 is that mark, redrawn heavier).

`overview.png` shows every concept on dark and light, as an app icon, at 16, 24 and 32 px, and as a lockup.

| # | Concept | Idea | Color version |
|---|---|---|---|
| 1 | Half | The prototype's mark, redrawn so it holds up at 16 px. Two halves of one coin. | No |
| 2 | Mid-flip | A coin caught mid-flip, its edge turning away. | Green face, red edge |
| 3 | Long / short | An up and a down arrow as one glyph that reads the same upside down. | Green up, red down |
| 4 | p / d | The p and d in "flipside" are the same letter turned around. One stem carries both bowls; in the wordmark the d is the p, flipped. | No |
| 5 | Two sides | A coin split down the middle: an up side and a down side. | Green and red halves |
| 6 | Flipped F | An F whose second arm has moved to the other side. | Red flipped arm |

## Files in each folder

- `mark-on-dark.svg`, `mark-on-light.svg`: the mark alone, `#EDEDED` for dark backgrounds and `#0A0A0A` for
  light ones, on a transparent 64 × 64 grid.
- `lockup-on-dark.svg`, `lockup-on-light.svg`: mark and wordmark. The wordmark is Inter SemiBold with -0.025em
  tracking, converted to outlines, so it renders the same without the font installed.
- `app-icon.svg`: 512 × 512, the mark on a black rounded square.
- `mark-color.svg` (where offered): uses the product's long green `#3DD68C` and short red `#FF5F5F`. In the UI
  those colors only ever mean long and short, so a color logo ties the brand to that meaning.

## Before one ships

- The name is still a working name (CLAUDE.md section 16). Marks 1, 2, 3, 5 and 6 work with any name; concept 4
  depends on the name having a p and a d, and every lockup's wordmark changes with the name.
- Once one is chosen: redraw the final at 16, 32 and 180 px for favicons and the iOS touch icon, replace
  `apps/web/src/app/icon.svg` and the header mark (`LogoMark` in `apps/web/src/components/ui.tsx`), and check
  that it doesn't clash with existing marks in crypto before registering it.
