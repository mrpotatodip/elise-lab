// The five themes of the dashboard (apps/elise-frontend-web, modules/shell) and the
// skies of the three picture themes. To add a sky, drop the file in public/theme-bgs
// and add its name here; the random pick in Base.astro reads this list.

// `note` is the one line under a theme's name in the footer picker, the dashboard's own words.
export const THEMES = [
  { id: "default", label: "Default", note: "Soft gray, light" },
  { id: "midnight", label: "Midnight", note: "Soft gray, dark" },
  { id: "daylight", label: "Daylight", note: "Bright, glass over a sky" },
  { id: "greenfields", label: "Greenfields", note: "Bright, glass over green fields" },
  { id: "moonlight", label: "Moonlight", note: "Dark, glass over a night sky" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

// A first visit, or a browser with no saved choice, gets this theme.
export const FIRST_THEME: ThemeId = "daylight";

// The dashboard keeps its choice under the same key. The two sites are on
// different origins, so the browser does not share it between them.
export const THEME_STORAGE_KEY = "elise.theme";

export const SKY_DIR = "/theme-bgs/";

export const THEME_SKIES = {
  daylight: ["bg-daylight-1.webp", "bg-daylight-2.webp", "bg-daylight-3.webp"],
  greenfields: ["bg-greenfields-1.webp", "bg-greenfields-2.webp", "bg-greenfields-3.webp"],
  moonlight: ["bg-moonlight-1.webp", "bg-moonlight-2.webp", "bg-moonlight-3.webp"],
} as const;
