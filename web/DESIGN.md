# DESIGN.md — family website

The site's own design spec. Component libraries and inspiration sites supply parts, not taste:
when they disagree with this file, this file wins.

## Feel

Apple-like and quiet: system font, generous space, soft greys, **one accent colour**, large headlines
that end in a full stop. Warm, short copy. Nothing flashy on pages people read; one hero moment
per page at most (the Home slideshow).

## Tokens (CSS variables in `src/styles.css`)

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#f5f5f7` | `#000` | page background |
| `--surface` / `--surface2` | `#fff` / `#fbfbfd` | `#1c1c1e` / `#121214` | cards / menu |
| `--fill` / `--fill2` | `#f5f5f7` / `#e8e8ed` | `#2c2c2e` / `#3a3a3c` | inputs, chips, segmented controls |
| `--text` / `--text2` / `--text3` | `#1d1d1f` / `#6e6e73` / `#86868b` | `#f5f5f7` / `#a1a1a6` / `#86868b` | body / secondary / labels |
| `--sep` / `--sep2` | 8% / 14% black | 10% / 18% white | hairlines |
| `--blue` (accent), `--blue-h`, `--link`, `--tint` | per theme | per theme | buttons, icons, links, selected rows |
| `--nav` | translucent | translucent | header, menu, breadcrumb bar (with blur) |
| `--r` | 18px | | card radius (buttons are pills, rows 10px) |

Type: system stack (`--font`), 17px body, headlines `clamp()` up to ~56px, letter-spacing −0.022em.
Spacing: multiples of 4px; page gutters `clamp(10px, 3vw, 28px)`.

## Themes (`data-theme` and `data-mode` on `<html>`, `lib/theme.ts`)

- **Mode**: Automatic (follows the device), Light or Dark. Every dark rule is written once as
  `@media (prefers-color-scheme:dark){ html:not([data-mode=light]) … }` and once as `html[data-mode=dark] …`.
- **Colours** change only the accent: Blue, Kumkum, Turmeric, Peacock, Tulsi, Lotus.
- **Styles** also change background, surfaces and card shapes. Three are inspired by the libraries in the
  design stack (their look, rebuilt in CSS — no library code is bundled):
  - **Clean** — shadcn/ui: zinc neutrals, hairline borders, no shadows, 8–12px radius, near-black accent.
  - **Spotlight** — Magic UI / Aceternity: dotted grid, spotlight glow at the top, glowing card edges on hover,
    gradient headline text, shimmering primary button (still under reduced motion).
  - **Playful** — React Bits: bold 2px outlines, offset shadows, bouncy hovers, colour-shifting headlines.
  - **Instagram** — sunset gradient (`--grad`) on primary buttons, selected chips, the avatar and the brand.
  - **Glass** — translucent surfaces over a soft fixed gradient; blur only on the menu and breadcrumb bar (blur is costly).
  - **Aurora** — Glass over slowly drifting light (38 s loop); still under `prefers-reduced-motion`.
- Saved on the device at once (localStorage) and on the account (`member_prefs.theme`, `member_prefs.mode`, migrations 0026 and 0027).

**Adding a theme:** add it to `COLOURS` or `STYLES` in `lib/types.ts` (+ label/hint), to the `member_prefs_theme_check`
constraint in a new migration (with a test), and define its light and dark variables in `styles.css` both ways above.
Check text contrast on `--surface` in both modes (4.5:1 for body text).

## Family traditions (H)

The interface is dressed like a Kerala–Tamil Iyer home, quietly, on top of the Apple-like base:

- **Woven border** from the member's traditions' dress (`lib/textiles.ts`, drawn in `components/Textiles.tsx`):
  with South Indian traditions, by gender (from the tree): men get the mayil kann (peacock-eye) veshti border
  in red or blue; women the Kanjeevaram saree border (peacock and medallion panels between creeper bands) in green or red;
  anyone else the green saree. Other traditions: their own textiles (phulkari and khes, bandhani and ajrak, paithani and
  pheta, laal paar and dhuti, Banarasi and leheriya, Sambalpuri, mekhela and gamosa, kunbi, kani, gara, kasavu…), each an
  edge colour, thin lines and a repeating motif; the default follows `who` wears it, and anyone may pick another in Theme.
  Full height on the Home hero; slim (16–18 px) under the breadcrumb bar. English traditions: no border.
- **Thoranam** of mango leaves and marigolds under the breadcrumb bar; sways 3–4 s, still under reduced motion.
- **Names** in Malayalam and Tamil above each page's English headline (`lib/heritage.ts`); members choose Both, one
  script or English only. System fonts only.
- **Kolam background**: a sikku pulli kolam repeated in a staggered 380 px tile at 5–6% opacity, fixed while scrolling.
- **Gopuram** for the generations: founders on the top tier under five kalasams, the newest at the gateway; tap a tier.
- **Lamp** (kuthuvilakku) for the panchangam line and remembrance days; **marigold** for birthdays.
- **Doors** (carved, `public/door.jpg`) open once per visit on Home; tap to skip; off under reduced motion or in Theme.

## Motion

150–250 ms ease-out for hovers, toggles and menus; sections fade in once. Every animation has a static fallback
under `prefers-reduced-motion`. No animation libraries are bundled: CSS only, so the site stays small and works on old phones.

## Components

Pills for primary actions (`.pill`, `.btn.primary`), chips for filters (`.chip`), sheets for forms (`Sheet`),
grouped menu with small uppercase group labels, sticky breadcrumb bar with Back. Icons: 18px line icons, stroke 1.8,
in the accent colour.
