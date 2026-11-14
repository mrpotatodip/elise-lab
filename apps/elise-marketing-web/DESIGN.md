# elise-marketing-web: Design

Generated 2026-11-15 from `apps/elise-frontend-web/DESIGN.md` as the baseline, then cut down to what a public landing page needs. **From here this file stands alone**: it is the only design reference for this site, and it changes when the site changes, without waiting for the dashboard. Where the dashboard's file and this one disagree, this one wins for the marketing site.

**Verified** means a file in this app defines it. **Rule** means a reviewer rejects a change that breaks it. **Baseline** means it came from the dashboard and has not been re-checked against the site yet: confirm it before relying on it, then promote it to Verified or change it.

The site is one page (`src/pages/index.astro`, static Astro) at `eliselab.com`. It shares no code with the dashboard and talks to no API: every call to action is a link to `SITE.appUrl`.

## Direction

A bright, quiet page led by the product. Neutral surfaces carry the page, the primary action is a dark gray (one per view), and colour appears only where it means something. The first view is a painted sky, a headline and a picture of the real dashboard. A first visit gets Daylight.

- **Rule** The product is the content. The hero picture and the three step pictures redraw the real dashboard screens with its real words. Nothing is decoration.
- **Rule** Depth comes from lightness steps, a 1px highlight and soft shadows, not heavy borders. Surfaces get lighter as they come forward.
- **Rule** Colour carries meaning. Dark gray = act here. Status and severity colours = state, and appear only inside the pictures of the app. Never use an accent colour for decoration.
- **Rule** Honest content: no price, count or customer until it exists. A price is printed only while the live plans table holds it (`PRICING` in `src/constants/site.ts`). Anything drawn for a picture is labelled as made up.

## Tokens

- **Verified** `src/styles/tokens.css` holds the `:root` tokens and the five theme blocks (Default, Midnight, Daylight, Greenfields, Moonlight). It started as a copy of the dashboard's `globals.css` and is **now this site's own file**. Edit it here; do not recopy the dashboard's lines over it. A new token is defined for every theme (the dark ones may share a block).
- **Verified** `src/styles/themes.css` is the site's layer over the tokens: page background and glow, the sky, the glass blur and the text halo.
- **Verified** Five themes, picked in the select in the footer and kept in `localStorage` under `elise.theme`. The dashboard uses the same key on another origin, so the choice is not shared. `FIRST_THEME` (`src/constants/themes.ts`) is `daylight`.
- **Verified** Skies: `public/theme-bgs/`, three WebP files per picture theme (Daylight, Greenfields, Moonlight), listed in `THEME_SKIES`. One is picked at random per load. Each is a 1778 by 592 banner centred at the top with its sides and bottom eased into the page colour; Daylight and Greenfields show it at 1.5 times, Moonlight at 1.1 times (capped at 1950px). No rotation: one sky per load.
- **Verified** Glass: in Daylight, Greenfields and Moonlight, cards, the outline button and the theme select blur what is behind them (`blur(10px) saturate(1.4)`). Default and Midnight are solid.
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
- **Verified** Radius `--radius: 0.75rem`: cards use it, buttons and the select use 8px.
- **Verified** Elevation tokens: `--shadow-card` (cards), `--shadow-control` (outline button, select), `--shadow-primary` (filled button).

## Layout

- **Verified** One column, `.wrap` is `min(70rem, 100% - 2rem)`, centred. Sections have `clamp(2.5rem, 6vw, 4rem)` of vertical padding.
- **Verified** Page order: nav (brand, anchor links, Sign in), hero, the app tour picture with its caption and a "Pause animations" control, How it works (three steps, one row each: text beside a full-size picture), Pricing (two plan cards and a line saying sign-up is not open), What to know (four facts, each an h3), the closing call to action, footer (links and the theme select).
- **Verified** Hero is two rows so the picture starts high: the headline across the full width, then the paragraph at 52ch beside the buttons and their hint (stacked on a phone). Keep the paragraph at 52ch or less and the buttons within sight of it.
- **Verified** Each picture of the app sits in a `.frame` that reserves its exact box (its design ratio, or 358 by 440 below 43rem) and stays invisible until its island has hydrated, so nothing shifts when it arrives. Below 640px the tour switches to a second, narrower design.
- **Rule** One `main` landmark, one `h1`. Each section has an `h2`; anything under it that needs a heading is `h3`. A picture of the app is a `role="img"` with a label (`PICTURE_LABELS`) and its contents hidden from screen readers.
- **Rule** A skip-to-content link comes first and targets `main`. Every anchor in the nav has a section with a matching id.

## Components

All hand-written CSS classes in `src/styles/global.css`; there is no component library on this site.

- **Button** (`.button`): 36px high, 40px for the hero and closing calls to action (`.lg`), 8px radius, 14px medium text. The filled one is the primary action with `--shadow-primary`; the outline one has a hairline and `--shadow-control`. Press moves it down 1px; focus is a 2px ring with a 2px offset (`:focus-visible`). **Rule** One filled button per view.
- **Card** (`.plan`): 24px padding, `--radius`, 1px `--border`, `--card` fill, `--shadow-card`, glass in the picture themes. Cards in a row are 32px apart and each is as tall as its own text.
- **Fact** (`.facts > div`): a top hairline, an h3 at 18px, text at 16px.
- **Theme select**: 36px, 8px radius, `--shadow-control`, glass in the picture themes.
- **Stageshow pictures** (`src/stageshow/`): the redrawn dashboard screens. They animate once when scrolled into view and end on their payoff. They stay Daylight in every page theme. `REHEARSAL.md` there says how to preview one.
- **Rule** A control is a real element: a link is `<a>`, an action is `<button>`, a choice is `<select>`.

## Text and spacing

- **Verified** Body text uses `line-height: 1.6`; the hero lede is 1.15rem at 52ch.
- **Verified** Headings: `h1` is `clamp(2.2rem, 5.5vw, 3.75rem)` at 1.08 line height; `h2` is `clamp(1.5rem, 3vw, 2rem)`; step and plan `h3` are 1.25rem; fact `h3` is 1.125rem.
- **Rule** Type follows the `uiux-audit` skill's references (`PUBLIC-PAGES.md`: body text at least 16px; `WCAG-22-AA.md` 1.4.3, 1.4.4, 1.4.12: contrast, resize to 200%, line height 1.5). Reading text (a paragraph, a step, a plan line, a fact, a section note) is **16px**, has a line height of 1.5 or more, and runs 52ch or less (Tailwind's 65ch fits 71 to 80 letters of this font; 52ch is the site's choice).
- **Rule** A title is at least 2px larger than the text under it (and bolder), never 1px apart. Secondary text (a hint under a button, a caption, a nav or footer link, the price unit, a control label) is 14px at the smallest. 12px is for labels only.
- **Rule** Sizes are in `rem`, so the text follows the browser's font setting and zoom to 200% without loss.
- **Rule** A link or control is at least 24px tall, a button or select at least 32px. The nav and footer links set `min-height: 1.5rem`.
- **Rule** Space follows one scale, in multiples of 4px: 6px from a heading to its text, 24px between groups and inside a card, 32px between cards. Measure it with `evidence.js` in the `uiux-audit` skill; do not judge it by eye.
- **Rule** Copy follows the `unslop` skill: plain words, no em dashes, one name per thing. The brand in running text is **EliseLAB**; the product, and anything drawn from the dashboard, says **Elise**. Site copy names no model vendor (demo pictures and the og image may).
- **Rule** A button names the action ("Audit a repository", "Create an account"), not "Submit". A hint beside it says where it leads.

## Motion

- **Rule** The pictures animate once when scrolled into view. The only loops are the small "in progress" pulse and spinner inside a picture, as the real dashboard has. `prefers-reduced-motion` stops them, and the "Pause animations" control (`data-motion="off"`) stops them for anyone.
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

- Text contrast on the glass cards in Moonlight and Daylight is judged on screenshots only.
- The hero picture is always Daylight, so it looks light on Moonlight and Midnight.
- The logo file in the page has an opaque white background and shows as a tile in the dark themes. A transparent version needs new artwork.
- The footer has no contact or privacy link: there is no content for either yet (decided 2026-11-15). Add both when they exist; a `uiux-audit` run reports it as a major finding (D12, Nielsen 10) until then.
- The page says a new account can run a scan today (confirmed by the owner 2026-11-15), and the monthly scan allowance resets on the 1st in UTC (the server's time zone). Re-check both when sign-up or the engine changes.
- Mobile CLS is 0.366 in Lighthouse on the production build but 0.0009 in a real browser; the cause under Lighthouse's throttling is untraced. The console reports 3 unlabelled form fields that are not in the page's DOM; also untraced.
- The 16px reading size and the 18px fact title were set 2026-11-15 after a `uiux-audit` run; the page has not been re-audited at those sizes.
- The Baseline values in the token table and the 52ch and 24px rules have not been re-measured against the built page since this file was generated.
- Widths other than desktop and the narrowest phone have not been reviewed.
- Nothing here covers a second page: there is only the landing page, so there is no per-page `DESIGN-SCREENS.md`. Add one when a second route exists.
