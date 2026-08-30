# Nekara — brand assets

| File | What it is |
|---|---|
| `nekara-mark.svg` | Primary mark. 12 rays. Use at 32px and above. |
| `nekara-mark-compact.svg` | 8 rays, heavier bezel. Use at 24px and below. |
| `gen.js`, `final.js` | The geometry, computed. Re-run to regenerate the SVGs. |
| `sheet.html` | The brand sheet — construction, lockups, scale, palette, type. |
| `references.html` | Six directions drawn and judged at real sizes, four rejected with the reason. |
| `dir-*.svg` | Those six directions, plus the three tally refinements. Exploration, not final assets. |
| `dirs.js`, `tally.js`, `buildref.js` | Generate the exploration marks and the reference sheet. |

Both marks are pure geometry with no text, and inherit `currentColor`, so a
colour change is a CSS change and a name change touches neither.

The wordmark is Spectral Light at 0.42em tracking, uppercase. For production
assets convert it to outlines — a webfont that fails to load takes the logo
with it.

Rejected directions are kept on purpose. Without them the next person has no
way to know that stacked bars read as a toolbar icon and three linked rings
read as Audi, and will draw them again.

Palette: charcoal `#12100D` · stone `#E9E6E0` · bronze `#8C6234`
(`#C08F52` on dark) · patina `#4E6B61`, used sparingly.
