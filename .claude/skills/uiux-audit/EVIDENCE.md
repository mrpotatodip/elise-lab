# Evidence recipe

#### When to use this file

Reach for this file for step 1 of `SKILL.md`, and before the reviewer. It is a fixed, short list of calls. The same list runs every time, so the evidence does not depend on what the person collecting it chose to look at. This file is the whole recipe: do not add calls "to be safe".

## Core discipline

```
- Run the recipe as written, once per route and width. Save every result to a file under .review/uiux-audit/ and read from the file.
- Text is cheap and pictures are not. Use the saved numbers and the snapshot text first. Open a screenshot only when a criterion is about how the page looks.
- Never read a whole snapshot or a whole report. grep it for the word or the criterion you need.
- Take a screenshot as webp at quality 60. Never take a full-page screenshot of a long page: take the viewport at each stop.
- A route is done when the files below exist. Do not collect more unless a criterion cannot be judged without it, and then say which one.
```

## The calls, in order

Use your own tab (`new_page`) and pass its `pageId` to every call, `navigate_page` and `resize_page` included: a call without one lands on the selected tab, which may be another's. If a browser tool answers `The browser is already running for ... chrome-profile`, another Chrome holds the profile: ask the user before closing it (`pkill -f chrome-devtools-mcp/chrome-profile`). Name files `<route>-<what>-<width>`; the examples use `home` and `1440`.

| # | Call | Saves | Used for |
|---|---|---|---|
| 1 | `resize_page` to the width, `navigate_page` to the route | none | |
| 2 | `evaluate_script` with `sourcePath` set to `evidence.js` in this skill folder, `filePath` set to `home-evidence-1440.json`, `waitForStableDom` false | the numbers: page facts, type sizes, contrast, reading breaks, targets, heading gaps, unlabelled fields, section tops | D3, D7, D8, D11, J6, and the plan for step 4 |
| 3 | `take_snapshot` with `filePath` set to `home-snapshot-1440.txt` | the page as text | J1 to J6, L1 to L6 (the cold read), WCAG 4.1.2 |
| 4 | `evaluate_script` `scrollTo(0, 0)`, then `take_screenshot` of the viewport at the top, then once per entry in `sections` from call 2 (scroll with `evaluate_script`, `scrollTo(0, top - 60)`), at most 6 for desktop | `home-<section>-1440.webp` | D1, D2, D4, D9, D10 and any finding about looks |
| 5 | Repeat 1 to 4 at the phone width, but with at most 3 screenshots (top, the widest section, the footer) | `home-*-500.*` | D8, D11 (reflow), PUBLIC-PAGES phones |
| 6 | `list_console_messages` with `types` set to `["error","warn","issue"]` | none: note each message | every error and warning accounted for |
| 7 | `lighthouse_audit`, desktop and mobile, with `outputDirPath` set to `lh-<width>/`, then read only `report.json` audits that failed | scores and failed audits | D7, D11, PUBLIC-PAGES speed (CLS) |
| 8 | Keyboard: `press_key` Tab twice, then `take_screenshot` of the viewport once | `home-focus.webp` | WCAG 2.4.7 |

Notes:

- Network: on a static page the console and Lighthouse already show a failing request. Call `list_network_requests` only with `resourceTypes` set to `["document","fetch","xhr"]`, and only on a page that calls an API.
- Walk a flow (`click`, `fill`) only when the route has one and a criterion needs it.
- Lighthouse can count Astro, Vite or other dev-server tools as page defects. Run it on a production build when one exists (`astro build` then `astro preview`), and say which you ran.
- The phone width is the narrowest the browser window allows (about 500). Say if 390 and 320 were not tested.
- For an app screen add the theme loop `chrome-review` describes (call 2 and one screenshot per theme).

## Done when

`<route>-evidence-<width>.json`, `<route>-snapshot-<width>.txt`, the screenshots, the Lighthouse folders and the console note exist for every route and width, and `start-diff.txt` was written first.
