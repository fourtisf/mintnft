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
point `CHROME` at one if it is not at the default path. `render.js` takes
banner names to redo a subset (`node brand/render.js m1-mint m2-mint-square`);
each page declares its own size in its CSS, and a page that declares none is
named on a non-zero exit rather than rendered at the wrong dimensions.

`mkshots.js` captures the key engravings too, so **it is part of re-running
parity after an artwork change**: the banners are laid out over the art the
contract renders, and a banner showing the previous engraving advertises a key
nobody can be sent.

| File | Size | Where it goes |
|---|---|---|
| `x-header.png` | 1500×500 | X profile header (left 400px kept clear for the avatar) |
| `x-avatar.png` | 1000×1000 | X profile picture. X crops it to a circle, so the mark sits at 66% with nothing in the corners. |
| `b2-intro.png` | 1600×900 | the introduction post, and OG image |
| `b3-method.png` | 1600×900 | the register: a win and a dead call side by side |
| `b4-square.png` | 1080×1080 | Telegram and Instagram |

The opening post. The register runs behind it, scrimmed back far enough that
only the mark and the name carry — no chip, no ticker, no chain list.

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
| `p6-callers.png` | 1600×900 | callers ranked on every call, not the best one | Caller leaderboard |

Keys. What a key actually is, in the site's own words. No price and no supply
counter on these two — they answer *what is this*, and the mint banners below
answer *what does it cost*.

| File | Size | Where it goes |
|---|---|---|
| `k1-keys.png` | 1600×900 | X |
| `k2-keys-square.png` | 1080×1080 | Telegram and Instagram |

Mint. These two carry the price ladder and the deployed contract address, so
they are the only banners that can go out of date on their own:

- the address is read from `out/keys.4663.json`, never typed. With no such
  record the banner says `belum di-deploy` and `mkbanners.js` prints a warning
  — a banner is not the place to guess an address people will send money to.
- `MINT_STATE` is the word in the pill, default `Coming soon`. **It has to match
  the phase on chain.** A banner that says mint now, next to a contract that
  reverts, is the one thing this product exists not to do. Override it when the
  phase opens: `MINT_STATE='Phase 1 · live' node brand/mkbanners.js`.
- the tier is blanked everywhere they show a key. On the site every tile and
  every plate carries a tier drawn from the sample seed, under a caption saying
  so; a banner carries no caption, and the season seed is not out, so a tier
  there would be a claim nobody can check. `mkshots.js` blanks it in the shots
  and `mkbanners.js` blanks it in the keys it draws itself.
- `m1-mint` draws its three keys **from the site's renderer, not from a
  screenshot of it** — `mkbanners.js` boots `prototype/proof.html` in jsdom and
  inlines the SVG. The engraved number plate sits at the far left of the square,
  so every crop that makes a screenshot fit a card cuts it in half; a vector has
  no crop. Nothing is laid over the art either: the copy keeps to its own half
  of the frame, because a scrim across the engraving is the one thing this
  banner cannot afford.

| File | Size | Where it goes |
|---|---|---|
| `m1-mint.png` | 1600×900 | X |
| `m2-mint-square.png` | 1080×1080 | Telegram and Instagram |

Scoreboards. The format every call channel posts, with a dead call left in the
fourth slot and the current multiple beside every peak. **The four calls on
these are the prototype's seed, not real ones** — edit `CALLS` in
`mkbanners.js` and re-render before either of these goes anywhere.

| File | Size | Where it goes |
|---|---|---|
| `s1-scoreboard.png` | 1600×900 | X |
| `s2-scoreboard-square.png` | 1080×1080 | Telegram and Instagram |

## Launch set (X)

Four announcements, each 1600×900 for X and 1080×1080 for Telegram and
Instagram. They share one frame — a hairline plate with registration marks, an
engine-turned ground, key light from the upper right — so a timeline shows one
account rather than four templates.

| File | Size | Where it goes |
|---|---|---|
| `x1-live.png` / `x2-live-square.png` | 1600×900 / 1080×1080 | the desk is live |
| `x3-launch.png` / `x3-launch-square.png` | 1600×900 / 1080×1080 | launch |
| `x4-mint-live.png` / `x4-mint-live-square.png` | 1600×900 / 1080×1080 | phase 1 mint |
| `x5-token.png` / `x5-token-square.png` | 1600×900 / 1080×1080 | the token |

`x5-token` carries no contract address on purpose. A banner cannot be corrected
once it is on a timeline, and the ticker is the part that does not change; the
address goes in the post, where a reply can fix it.

Its four facts are structural — chain id, append-only, the gate count, the
season size — and every one of them is checkable. Nothing that moves goes on a
banner: a hit rate printed here is a number that was true the day it rendered.
**`14 hard vetoes` is `GATES.length`.** Add or remove a gate and this banner is
wrong until it is re-rendered, which is the same rule as the artwork and
`parity.js`.

**The ground is the collection.** `keyWall` lays the same tiles the Mint page
lays out, drawn from the site's own renderer through jsdom rather than from a
screenshot of it, offset half a pitch per row and bleeding past the trim on
every side so no tile is cut in a way that looks like a mistake. A colour field
behind a key is a backdrop somebody picked; the keys behind it are the thing
being sold.

They are drawn on `--art`, which is very nearly black, so the wall carries a
brightness lift — under any scrim at all an unlifted wall reads as nothing. The
scrim is then shaped rather than spread evenly: heaviest exactly where the mono
type sits, because a spec line over a bright tile is a line nobody reads.

The hero key is chosen, not defaulted. Key 3 renders Verdant, and a green figure
behind a blue-to-violet wordmark is two brands in one frame; `TOKEN_KEY` is an
Azure one. Every key on the wall and the hero alike goes through `keyBody`, so
the tier is blanked on all of them.
