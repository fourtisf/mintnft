# Nekara — brand assets

| File | What it is |
|---|---|
| `nekara-mark.svg` | Primary mark. 12 rays. Use at 32px and above. |
| `nekara-mark-compact.svg` | 8 rays, heavier bezel. Use at 24px and below. |
| `gen.js`, `final.js` | The geometry, computed. Re-run to regenerate the SVGs. |
| `sheet.html` | The brand sheet — construction, lockups, scale, palette, type. |

Both marks are pure geometry with no text, and inherit `currentColor`, so a
colour change is a CSS change and a name change touches neither.

The wordmark is Spectral Light at 0.42em tracking, uppercase. For production
assets convert it to outlines — a webfont that fails to load takes the logo
with it.

Palette: charcoal `#12100D` · stone `#E9E6E0` · bronze `#8C6234`
(`#C08F52` on dark) · patina `#4E6B61`, used sparingly.
