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
| `nekara-mark-blue.svg` | Byte-identical to `nekara-mark.svg` — the mark takes `currentColor`, so blue is the host's choice, not a second file. |
| `art.js`, `buildx.js`, `xassets.html` | Build the social artwork and its preview page. |

Both marks are pure geometry with no text, and inherit `currentColor`, so a
colour change is a CSS change and a name change touches neither.

The wordmark is Spectral Light at 0.42em tracking, uppercase. For production
assets convert it to outlines — a webfont that fails to load takes the logo
with it.

Rejected directions are kept on purpose. Without them the next person has no
way to know that stacked bars read as a toolbar icon and three linked rings
read as Audi, and will draw them again.

Two palettes, one mark. Bronze for print and the NFT cards; blue for social.
The mark serves both because it is one colour and carries no letters.

Social blue: navy `#060A11` · glow `#16305E` · pale `#EDF2FB`. The mark is flat
`#6C9BE0` wherever it is the mark, and a `#A6C6F5 → #3D6AB4` gradient only in
the raster artwork — polished metal is a treatment, not part of the identity.
A grain overlay at 5% and an engraved hairline plate edge do the rest; both
exist to stop the flat-digital look, and neither belongs in the SVG.

Palette: charcoal `#12100D` · stone `#E9E6E0` · bronze `#8C6234`
(`#C08F52` on dark) · patina `#4E6B61`, used sparingly.

## Banners

The four launch banners are laid out over screenshots of the site, not over a
stand-in for it. `mkshots.js` opens `site/` from a `file://` URL so `app.js`
takes its DEMO branch — the production register is empty, and a banner of an
empty register shows nothing — then crops the pieces the layouts need. Rebuild
the whole set after any change to the site's design:

    node brand/mkshots.js     # source imagery, from site/
    node brand/mkbanners.js   # layouts -> banners/*.html
    node brand/render.js      # -> banners/*.png at 2x

or `brand/mkbanners.sh` for all three. Needs `playwright` and a chromium;
point `CHROME` at one if it is not at the default path.

| File | Size | Where it goes |
|---|---|---|
| `x-header.png` | 1500×500 | X profile header (left 400px kept clear for the avatar) |
| `x-avatar.png` | 1000×1000 | X profile picture. X crops it to a circle, so the mark sits at 66% with nothing in the corners. |
| `b2-intro.png` | 1600×900 | the introduction post, and OG image |
| `b3-method.png` | 1600×900 | the register: a win and a dead call side by side |
| `b4-square.png` | 1080×1080 | Telegram and Instagram |

The opening post. No product shot — it only has to land the name and say the
contract is not out yet, and it borrows the site's own nav chip to say it.

| File | Size | Where it goes |
|---|---|---|
| `p0-intro.png` | 1600×900 | first post on X |
| `p0-intro-square.png` | 1080×1080 | the same, for Telegram and Instagram |

Posts. Each one is a claim on the left and the piece of the site that backs it
on the right; the copy comes from the page the panel was cropped from.

| File | Size | Claim | Panel |
|---|---|---|---|
| `p1-triage.png` | 1600×900 | rejections are published with the gate that killed them | Rejected candidates |
| `p2-custody.png` | 1600×900 | removing a call breaks every hash after it | Chain head, and the tamper check failing |
| `p3-hindsight.png` | 1600×900 | peak × is a ceiling nobody sold at | What you would actually have made |
| `p4-gates.png` | 1600×900 | eight vetoes run before anything is scored | Active gates |
| `p5-scan.png` | 1080×1080 | what the screener passed on | Last 24 hours |
