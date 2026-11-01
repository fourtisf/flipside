# Coinside premium brand set

The chosen mark, **Two sides** (a coin split down the middle: an up side and a down side), finished for social
and marketing: a thin coin rim and a platinum face, plus a color version with the long green and short red halves.
In the product UI the flat `#EDEDED` mark stays (`LogoMark` in `apps/web/src/components/ui.tsx`); these files are
for X, posts and slides.

| File | Size | Use |
|---|---|---|
| `x-header.png` | 1500 × 500 | X header. Text sits left and above the bottom-left corner the profile picture covers. |
| `x-profile.png` | 400 × 400 | X profile picture (X crops it to a circle). |
| `x-profile-color.png` | 400 × 400 | The same, green and red halves. |
| `lockup-on-black.png` | 1200 × 400 | Mark and wordmark on black, for posts and slides. |
| `lockup.png`, `lockup-color.png` | 1040 × 256 | Mark and wordmark, transparent, for dark backgrounds. |
| `mark.png`, `mark-color.png` | 512 × 512 | The mark alone, transparent. |

Each PNG has its SVG source next to it. Type is Inter SemiBold (wordmark and headline) and Geist Mono (labels and
domain); the SVGs use them as text, so render with those fonts installed. Rebuild everything with
`node brand/premium/build.mjs` (needs `sharp` from apps/web).
