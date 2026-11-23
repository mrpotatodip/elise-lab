# elise-marketing-web: Design

Generated 2026-11-15 from `apps/elise-frontend-web/DESIGN.md` as the baseline, then cut down to what a public landing page needs. **From here this file stands alone**: it is the only design reference for this site, and it changes when the site changes, without waiting for the dashboard. Where the dashboard's file and this one disagree, this one wins for the marketing site.

**Verified** means a file in this app defines it. **Rule** means a reviewer rejects a change that breaks it. **Baseline** means it came from the dashboard and has not been re-checked against the site yet: confirm it before relying on it, then promote it to Verified or change it.

The site is a landing page (`src/pages/index.astro`) with two legal pages (`privacy.astro`, `terms.astro`, through `layouts/Legal.astro`), static Astro, at `eliselab.com`. It shares no code with the dashboard and talks to no API: every call to action is a link to `SITE.appUrl` (the sign-in page) or, for "Create an account", `SITE.signUpUrl` (`/signup`).

## Direction

A bright, quiet page led by the product. Neutral surfaces carry the page, the primary action is a dark gray (one per view), and colour appears only where it means something. The first view is a painted sky, a headline and a picture of the real dashboard. A first visit gets Daylight.

- **Rule** The product is the content. The hero picture and the three step pictures redraw the real dashboard screens with its real words. Nothing is decoration.
- **Rule** Depth comes from lightness steps, a 1px highlight and soft shadows, not heavy borders. Surfaces get lighter as they come forward.
- **Rule** Colour carries meaning. Dark gray = act here. Status and severity colours = state, and appear only inside the pictures of the app. Never use an accent colour for decoration.
- **Rule** Honest content: no price, count or customer until it exists. A price is printed only while the live plans table holds it (`PRICING` in `src/constants/site.ts`). Anything drawn for a picture is labelled as made up.

## Tokens

- **Verified** `src/styles/tokens.css` holds the `:root` tokens and the five theme blocks (Default, Midnight, Daylight, Greenfields, Moonlight). It started as a copy of the dashboard's `globals.css` and is **now this site's own file**. Edit it here; do not recopy the dashboard's lines over it. A new token is defined for every theme (the dark ones may share a block).
- **Verified** `src/styles/themes.css` is the site's layer over the tokens: page background and glow, the sky, the glass blur and the text halo.
- **Verified** Five themes, picked in a dialog that a button in the footer opens (one preview tile per theme, as the dashboard's `ShellThemeSwitch` does) and kept in `localStorage` under `elise.theme`. The dashboard uses the same key on another origin, so the choice is not shared. `FIRST_THEME` (`src/constants/themes.ts`) is `daylight`.
- **Verified** Skies: `public/theme-bgs/`, three WebP files per picture theme (Daylight, Greenfields, Moonlight), listed in `THEME_SKIES`. One is picked at random per load. Each is a 1778 by 592 banner centred at the top with its sides and bottom eased into the page colour; Daylight and Greenfields show it at 1.5 times, Moonlight at 1.1 times (capped at 1950px). No rotation: one sky per load.
- **Verified** Glass: in Daylight, Greenfields and Moonlight, cards, the outline button and the theme button blur what is behind them (`blur(10px) saturate(1.4)`), and the theme dialog blurs harder (`--dialog-blur`, 32px). Default and Midnight are solid.
- **Verified** Text halo: the hero sits on the sky with no glass behind it, so `--halo` and a stronger ink `--lede` keep it readable (a light halo in Daylight and Greenfields, a dark one in Moonlight).

| Role | Token | Default value (oklch) |
|---|---|---|
| Page | `--background` | 0.958 |
| Card | `--card` | 0.99 |
| Popover | `--popover` | 0.998 |
| Muted fill | `--muted` | 0.94 |
| Text | `--foreground` | 0.22 |
| Secondary text | `--muted-foreground` | 0.36 |
| Border | `--border` | black at 9% |
| Field border | `--input` | black at 16% |
| Hover fill | `--accent` | black at 5.5% |
| Primary | `--primary` | 0.27, text on it near-white |

Baseline values, from the dashboard's table. Re-measure against `tokens.css` before quoting them.

- **Rule** Use a semantic token (`var(--card)`, `var(--muted-foreground)`, `var(--primary)`). No hex values and no new colours in a component.
- **Rule** Ink and mark are different jobs. A colour that carries **text** (an ink) clears 4.5:1. A colour used as a **shape** (a dot, a bar, a ring) is a mark, opaque, and clears 3:1 against its card. Never fill a shape with an ink at partial opacity. Colour is never the only signal.
- **Verified** System font stacks only (`--font-sans`, `--font-mono`). No web fonts. Code, file paths and model names use mono.
- **Verified** Radius `--radius: 0.75rem`: cards use it, buttons and the theme button use 8px, the theme dialog 16px and its tiles 12px.
- **Verified** Elevation tokens: `--shadow-card` (cards), `--shadow-control` (outline button), `--shadow-primary` (filled button).

## Layout

- **Verified** One column, `.wrap` is `min(70rem, 100% - 2rem)`, centred. Sections have `clamp(2.5rem, 6vw, 4rem)` of vertical padding.
- **Verified** The anchor links in the nav sit in a second row under the brand and Sign in below 48rem, and beside them from 48rem up. Reading text in the facts and section notes is capped at 50ch, because the audit's script counts about 53 letters in a 52ch box.
- **Verified** Page order: nav (brand, anchor links, Sign in), hero, the app tour picture (a terminal running the Runner over the dashboard; no caption and no pause control, by the owner's choice on 2026-11-23), How it works (three steps, one row each: text beside a full-size picture), Get the Runner (the install command in a one-line scrolling box, notes, and a link to the releases page; `RUNNER` in `src/constants/site.ts` keeps the command equal to the dashboard's Getting started guide), Pricing (a Monthly/Yearly toggle, two plan cards and a "Create an account" button), What to know (four facts, each an h3), the closing call to action, footer (links and the theme picker).
- **Verified** Hero is two rows so the picture starts high: the headline across the full width, then the paragraph at 52ch on the left and the buttons and their hint on the right, right-aligned to the page edge under Sign in (from 56rem up; stacked and left-aligned on a phone). Keep the paragraph at 52ch or less and the buttons within sight of it.
- **Rule** A picture's `.frame--*` aspect ratio in `global.css` equals its stage's width and height in `Steps.tsx` or `RunnerScene.tsx` (the steps are 760 by 740, 660 and 860). Change one, change the other: a taller stage in an unchanged frame spills over the text after it.
- **Verified** Each picture of the app sits in a `.frame` that reserves its exact box (its design ratio, or 358 by 440 below 43rem) and stays invisible until its island has hydrated, so nothing shifts when it arrives. Below 640px the tour switches to a second, narrower design.
- **Rule** One `main` landmark, one `h1`. Each section has an `h2`; anything under it that needs a heading is `h3`. A picture of the app is a `role="img"` with a label (`PICTURE_LABELS`) and its contents hidden from screen readers.
- **Rule** A skip-to-content link comes first and targets `main`. Every anchor in the nav has a section with a matching id.

## Components

All hand-written CSS classes in `src/styles/global.css`; there is no component library on this site.

- **Button** (`.button`): 36px high, 40px for the hero and closing calls to action (`.lg`), 8px radius, 14px medium text. The filled one is the primary action with `--shadow-primary`; the outline one has a hairline and `--shadow-control`. Press moves it down 1px; focus is a 2px ring with a 2px offset (`:focus-visible`). **Rule** One filled button per view.
- **Card** (`.plan`): 24px padding, `--radius`, 1px `--border`, `--card` fill, `--shadow-card`, glass in the picture themes. Cards in a row are 32px apart, the same width, and stretch to the same height (the shorter one has empty space at the bottom). On a phone they stack and each is as tall as its own text.
- **Fact** (`.facts > div`): a top hairline, an h3 at 18px, text at 16px.
- **Theme picker** (`ThemeSelect.astro`, `.theme-trigger` and `.theme-dialog`), copied from the dashboard's `ShellThemeSwitch`. The button (40px high, 8px radius, `--muted` fill, 1px `--border`) shows the current theme's icon, "Theme" and the theme's name; the icon and name follow `<html data-theme>` through CSS. It opens a native `<dialog>` (focus trap, Esc, a click on the backdrop closes it): 34rem wide, 16px radius, `--popover` fill, a tinted header ("Theme" and one line saying it is saved in this browser), and a body of tiles, two across from 40rem and one below. A tile is a `<button aria-pressed>`: a miniature of the theme (page, card and ink, fixed literals in `themes.css`, the one place a component names another theme's colours), then its icon (lucide, 1.5 stroke), name and a one-line note in the dashboard's words. The chosen tile has a `--primary` border, a tinted fill and a check, so it never rests on colour alone. Picking a tile applies the theme and closes the dialog. Tile notes are 14px here (the dashboard uses 12px).
- **Stageshow pictures** (`src/stageshow/`): the redrawn dashboard screens. They animate once when scrolled into view and end on their payoff. They follow the page theme, live, with no reload: `.dl` (`daylight.css`) sets no colours, so a picture reads the same tokens as the page, including `--sky` (none in Default and Midnight), `--halo` and the glass blur. A new colour in a picture is a token, never a literal. `REHEARSAL.md` there says how to preview one.
- **Rule** A control is a real element: a link is `<a>`, an action is `<button>`, a choice is a `<select>`, or a dialog of `aria-pressed` buttons when each option needs a preview (the theme picker).

## Text and spacing

- **Verified** Body text uses `line-height: 1.6`; the hero lede is 1.15rem at 52ch.
- **Verified** Headings: `h1` is `clamp(2.2rem, 5.5vw, 3.75rem)` at 1.08 line height; `h2` is `clamp(1.5rem, 3vw, 2rem)`; step and plan `h3` are 1.25rem; fact `h3` is 1.125rem.
- **Rule** Type follows the `uiux-audit` skill's references (`PUBLIC-PAGES.md`: body text at least 16px; `WCAG-22-AA.md` 1.4.3, 1.4.4, 1.4.12: contrast, resize to 200%, line height 1.5). Reading text (a paragraph, a step, a plan line, a fact, a section note) is **16px**, has a line height of 1.5 or more, and runs 52ch or less (Tailwind's 65ch fits 71 to 80 letters of this font; 52ch is the site's choice).
- **Rule** A title is at least 2px larger than the text under it (and bolder), never 1px apart. Secondary text (a hint under a button, a caption, a nav or footer link, the price unit, a control label) is 14px at the smallest. 12px is for labels only.
- **Rule** Sizes are in `rem`, so the text follows the browser's font setting and zoom to 200% without loss.
- **Rule** A link or control is at least 24px tall, a button or select at least 32px (the theme button is 40px). The nav and footer links set `min-height: 1.5rem`.
- **Rule** Space follows one scale, in multiples of 4px: 6px from a heading to its text, 24px between groups and inside a card, 32px between cards. Measure it with `evidence.js` in the `uiux-audit` skill; do not judge it by eye.
- **Rule** Copy follows the `unslop` skill: plain words, no em dashes, one name per thing. The brand in running text is **EliseLAB**; the product, and anything drawn from the dashboard, says **Elise**. Site copy names no model vendor (demo pictures and the og image may).
- **Rule** A button names the action ("Audit a repository", "Create an account"), not "Submit". A hint beside it says where it leads.

## Motion

- **Rule** The pictures animate once when scrolled into view. The only loops are the small "in progress" pulse and spinner inside a picture, as the real dashboard has. `prefers-reduced-motion` stops them. There is no on-page pause control (removed 2026-11-23, by the owner's choice): each picture plays once and rests on its last frame.
- **Rule** Animate only transform and opacity. Nothing moves the layout.

## Performance and delivery

- **Verified** Static build (`astro build`), served from a Worker's static assets. `public/_headers` sets the security headers, a content security policy and cache rules.
- **Verified** The tour hydrates when the browser is idle; the three step pictures when they scroll into view. Sky pictures are WebP.
- **Verified** Link preview `public/og.jpg` is 1200 by 630. `public/sitemap.xml` and the structured data in `Base.astro` state only what the page says.
- **Rule** Body text on a phone is at least 16px where it sits next to a field, so the browser does not zoom. The page has no sideways scroll at 320px.

## Design standard

The ten items below are a checklist, read for a landing page. A reviewer reports each as a finding or "clean" and gives no score (the `uiux-audit` skill is unscored). Items about tables, filters and scan pills from the dashboard do not apply here.

1. **Hierarchy**: the eye lands on the headline, then the picture of the app, then the call to action.
2. **Consistency**: one icon style, one radius family, one spacing rhythm (multiples of 4px, gaps of 24 and 32).
3. **Contrast**: text 4.5:1 or better, large text and UI edges 3:1 or better, measured. Text on glass over a sky cannot be measured by `evidence.js`; judge it on a screenshot and say so.
4. **Colour meaning**: one accent for action; status and severity colour only inside the pictures of the app; nothing decorative.
5. **Content honesty**: no invented numbers, customers or prices; every made-up picture labelled; a claim is something a dashboard screen states.
6. **Interaction**: hover, focus-visible, pressed and disabled all visible; no dead controls; every call to action leads to the app and says so.
7. **Accessibility**: one `main`, one `h1`, labelled controls, links announced as links, a skip link, a page title, reduced motion respected, and Lighthouse accessibility 100.
8. **Polish**: nothing clipped, misaligned, unexplained or shifting as it loads.
9. **Balance**: a few aligned rows, not a pile of cards. Plan cards share one header shape. The page leads with one thing to do.
10. **Restraint**: colour marks state, not decoration; each colour keeps one meaning; the page is neutral surfaces and the sky.

## Known gaps

- The tour picture has no visible "made up" label (the caption was removed on 2026-11-23, by the owner's choice). Its alt text says every name and number is made up, and the How it works note says so for the three step pictures. A sighted visitor reads no label next to the hero.
- Text contrast on the glass cards in Moonlight and Daylight is judged on screenshots only.
- The pictures follow the page theme, but their text and glass in Moonlight, Midnight and Greenfields have been checked on screenshots only, at 1440px and one frame of each animation. The kit's own `data-theme="dark"` rules (code blocks, the circle cursor) are not applied: only the arrow cursor is switched.
- The logo file in the page has an opaque white background and shows as a tile in the dark themes. A transparent version needs new artwork.
- The privacy and terms pages run text at 80ch, not 52ch, and show the sub-processor cards two across, by the owner's request (2026-11-23). The landing page keeps 52ch.
- The privacy and terms wording needs a person's approval (spec #326) before the site deploys.
- The page says a new account can run a scan today (confirmed by the owner 2026-11-15), and the monthly scan allowance resets on the 1st in UTC (the server's time zone). Re-check both when sign-up or the engine changes.
- Mobile CLS is 0.366 in Lighthouse on the production build but 0.0009 in a real browser; the cause under Lighthouse's throttling is untraced. The console reports 3 unlabelled form fields that are not in the page's DOM; also untraced.
- The 16px reading size and the 18px fact title were set 2026-11-15 after a `uiux-audit` run; the page has not been re-audited at those sizes.
- The Baseline values in the token table and the 52ch and 24px rules have not been re-measured against the built page since this file was generated.
- Widths other than desktop and the narrowest phone have not been reviewed.
- Nothing here covers a second page: there is only the landing page, so there is no per-page `DESIGN-SCREENS.md`. Add one when a second route exists.
