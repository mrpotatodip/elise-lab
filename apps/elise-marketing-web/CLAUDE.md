# elise-marketing-web

Public marketing site at `eliselab.com`: Astro, static output, served from a Worker's static assets. It shares no code with the dashboard (`apps/elise-frontend-web`, `app.eliselab.com`) and talks to no API: every call to action is a link to `SITE.appUrl`.

- Copy lives in `src/constants/site.ts`; pages in `src/pages/`, one `.astro` file per route. Read `DESIGN.md` here before a visual change: it holds the tokens, themes, type sizes and layout, and it stands alone (the dashboard's `DESIGN.md` does not apply). `src/styles/tokens.css` is this site's own file: edit it here. Copy follows the `unslop` skill.
- In text people read the brand is **EliseLAB**; the product itself says "Elise" (as in the dashboard). Don't print a claim the product can't back: no counts or customers until they exist, and a price only while the live plans table holds it. The example finding is labelled as an example.
- Dev runs on port 3200 (`pnpm dev` starts it with the others). `pnpm check` is `astro check` and oxlint; `astro build` writes `dist/`.
- After a visible change, run `/uiux-audit` on `localhost:3200`: `check` never renders a page.
- Deploy: `pnpm --filter elise-marketing-web run deploy` (live site: ask first). The first deploy also claims the `eliselab.com` custom domain, so the apex must be free of other DNS records.
