# Public pages: landing, marketing and pricing

#### When to use this file

Reach for this file only when the route is a public page (the marketing site, a pricing page, a sign-in page a stranger lands on), not an app screen. It adds what `DESIGN.md` and the app criteria do not cover: first-view clarity, claims, speed, link previews and phones. Each rule says whether it is a **standard** (a published pass or fail number) or a **convention** (common practice, a judgement call). This file is the whole reference: do not fetch the sources.

## Core discipline (include in the reviewer prompt)

```
- Review a public page as a stranger arriving cold, from a search result or a shared link.
- A claim the product cannot back is a blocker: a price, count, customer, certification or guarantee that is not true today. Compare each with the site's own CLAUDE.md and the product's live data when a probe is allowed. An example must be labelled as an example.
- Measure speed and layout shift with the numbers below, never by feel.
- Never fetch or search the web to compare with other sites.
```

## First view (convention)

At 1440 by 900 and at 390 by 844, the part of the page visible without scrolling says:

- **What it is**, in one sentence of plain words.
- **Who it is for.**
- **What to do next**: one primary button, with a line saying where it leads.

More than one equal-weight primary action is a finding. A headline that describes the company and not the benefit is a finding.

## Claims and honesty

- Every number, price, plan and promise matches what the product does today.
- Made-up data in a picture or demo is labelled as made up, once, close to it.
- No fake scarcity, fake urgency or unnamed testimonials.
- A plan or price states what the buyer needs to decide: what it includes, what it does not cover, what happens when the credit or allowance runs out, and what cancelling does. Anything not decided yet is left out, not guessed.
- A feature that is not open yet says so in plain words ("Sign-up opens soon").

## Speed and stability (standard: Google's Core Web Vitals, 75th percentile "good")

| Metric | Good | How |
|---|---|---|
| LCP, largest content shown | 2.5 s or less | Lighthouse run in the evidence step |
| INP, delay after a tap or click | 200 ms or less | Lighthouse or the performance trace |
| CLS, layout shift | 0.1 or less | Lighthouse; reserve the size of images and late-loading pictures |

A lab run on localhost is a hint, not the field value. Say which it was.

## Motion

- Anything that moves by itself for more than 5 seconds can be paused (WCAG 2.2.2).
- `prefers-reduced-motion: reduce` stops or simplifies it.
- No autoplay sound. Nothing flashes.
- The page still reads correctly with the animation stopped and shows the finished state.

## Link previews and search (convention)

- A title that names the product and what it does, short enough not to be cut in a result (about 60 characters).
- A meta description in plain words (about 150 to 160 characters) that states only what the page says.
- A canonical link, `<html lang>`, and an icon.
- A preview image of 1200 by 630 with alt text; the Open Graph and Twitter title and description match the page.
- Structured data states only what the page states: no rating, review or price the page does not show.

## Phones (convention, plus WCAG 1.4.10)

- Check at 390 by 844 and at 320 wide: no sideways scroll, no text under a fixed bar, targets at least 24 by 24 CSS px (WCAG 2.5.8) and, as practice, 44 by 44 for the main button.
- Body text at least 16px so the browser does not zoom on a field.
- The primary button is reachable without scrolling past a picture.

## Footers and trust

- A way to contact or get help, and where sign-in is.
- Legal pages the business actually has. A missing page the page's claims need (privacy for a product that reads code) is a finding.
