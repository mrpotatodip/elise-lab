// Pass the contents of this file as the `function` of mcp__chrome-devtools__evaluate_script, with
// `filePath` set to .review/uiux-audit/<route>-evidence-<width>.json so the numbers are saved, not
// pasted into the conversation. One call replaces measure.js plus a dozen small checks.
// Change ROOT to scope the text and target measurements (a dialog: '[role=dialog]').
async () => {
  const ROOT = "main";
  const root = document.querySelector(ROOT) ?? document.body;
  const rect = (el) => el.getBoundingClientRect();
  const visible = (el) => rect(el).width > 0 && rect(el).height > 0;
  const hiddenFromReaders = (el) => !!el.closest("[aria-hidden=true], .sr-only, [hidden]");

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const luminance = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const backdrop = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    return layers.reverse().reduce((base, l) => base.map((v, i) => v * (1 - l[3]) + l[i] * l[3]), [255, 255, 255]);
  };
  const onGlass = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const alpha = rgba(getComputedStyle(e).backgroundColor)[3];
      if (alpha > 0 && alpha < 1) return true;
    }
    return false;
  };
  const contrast = (el) => {
    const fg = rgba(getComputedStyle(el).color);
    const bg = backdrop(el);
    const mixed = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
    const [a, b] = [luminance(mixed), luminance(bg)];
    return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
  };
  const m2d = document.createElement("canvas").getContext("2d");
  // The reading width in `ch` (the width of a "0" in the element's own font), the unit the 52ch rule uses.
  const chars = (el) => {
    const s = getComputedStyle(el);
    m2d.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    return +(rect(el).width / m2d.measureText("0").width).toFixed(1);
  };

  // Type sizes, low contrast, text on glass.
  const sizes = {};
  const lowContrast = {};
  const glass = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const el = node.parentElement;
    if (text.length < 2 || hiddenFromReaders(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    sizes[px] = (sizes[px] ?? 0) + text.length;
    const ratio = contrast(el);
    if (ratio < 4.5) lowContrast[text.slice(0, 30)] = ratio;
    if (onGlass(el)) glass.push(text.slice(0, 30));
  }
  const total = Object.values(sizes).reduce((a, b) => a + b, 0) || 1;

  // Reading text: size, line height and width in ch, only where it breaks a rule (14px, 1.5, 52ch).
  const reading = [...root.querySelectorAll("p, li, dd, figcaption")]
    .filter((p) => p.innerText.trim().length > 60 && visible(p) && !hiddenFromReaders(p))
    .map((p) => {
      const s = getComputedStyle(p);
      return { text: p.innerText.trim().slice(0, 34), px: parseFloat(s.fontSize), lh: +(parseFloat(s.lineHeight) / parseFloat(s.fontSize)).toFixed(2), ch: chars(p) };
    });
  // 53, not 52: a box set to 52ch measures 52.1 to 52.9 here because of font rounding.
  const readingBreaks = reading.filter((r) => r.px < 14 || r.lh < 1.5 || r.ch > 53);

  const smallTargets = [...root.querySelectorAll("a[href], button, [role=combobox], summary, select")]
    .filter((e) => visible(e) && rect(e).height < 24 && !e.closest("p, li") && !hiddenFromReaders(e))
    .map((e) => `${(e.getAttribute("aria-label") ?? e.innerText).trim().slice(0, 24)} ${Math.round(rect(e).height)}px`);

  const headings = [...root.querySelectorAll("h1, h2, h3, h4")].filter((h) => !hiddenFromReaders(h)).map((h) => {
    const next = h.nextElementSibling;
    const s = getComputedStyle(h);
    return { tag: h.tagName.toLowerCase(), text: h.textContent.trim().slice(0, 30), px: parseFloat(s.fontSize), gapToNext: next ? Math.round(rect(next).top - rect(h).bottom) : null };
  });

  // Page facts for WCAG 2.4.1, 2.4.2, 3.1.1, 1.4.10 and the public-page rules.
  const meta = (sel, attr = "content") => document.querySelector(sel)?.getAttribute(attr) ?? null;
  const firstLink = document.querySelector("a[href]");
  const unlabelled = [...document.querySelectorAll("input, select, textarea")]
    .filter((f) => !f.labels?.length && !f.getAttribute("aria-label") && !f.getAttribute("aria-labelledby") && f.type !== "hidden")
    .map((f) => `${f.tagName.toLowerCase()}${f.id ? "#" + f.id : ""}${f.closest("[aria-hidden=true]") ? " (in aria-hidden)" : ""}`);
  const noAlt = [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt") && !hiddenFromReaders(i)).map((i) => i.currentSrc.slice(-40));
  const genericLinks = [...document.querySelectorAll("a[href]")]
    .filter((a) => !hiddenFromReaders(a) && /^(here|click here|link|more|learn more|read more)$/i.test((a.innerText || "").trim()))
    .map((a) => a.getAttribute("href"));
  const unsafeBlank = [...document.querySelectorAll('a[target="_blank"]')].filter((a) => !/noopener|noreferrer/.test(a.rel)).map((a) => a.getAttribute("href"));
  const moving = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().iterations === Infinity).length;

  // Where each section starts, so a screenshot plan needs no further calls.
  const sections = [...document.querySelectorAll("main > *, main section, footer")]
    .filter((s) => visible(s) && !hiddenFromReaders(s))
    .map((s) => ({ id: s.id || s.tagName.toLowerCase() + (s.className ? "." + String(s.className).split(" ")[0] : ""), top: Math.round(rect(s).top + scrollY), h: Math.round(rect(s).height) }));

  return {
    viewport: { w: innerWidth, h: innerHeight },
    path: location.pathname,
    theme: document.documentElement.dataset.theme ?? "default",
    page: {
      lang: document.documentElement.lang || null,
      title: document.title,
      mains: document.querySelectorAll("main").length,
      h1s: document.querySelectorAll("h1").length,
      skipLink: !!firstLink && (firstLink.getAttribute("href") || "").startsWith("#"),
      metaDescriptionLength: meta("meta[name=description]")?.length ?? null,
      canonical: !!meta("link[rel=canonical]", "href"),
      ogImage: !!meta("meta[property='og:image']"),
      viewportMeta: meta("meta[name=viewport]"),
      docOverflowsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      reducedMotionPref: matchMedia("(prefers-reduced-motion: reduce)").matches,
      motionOff: document.documentElement.dataset.motion === "off",
      loopingAnimationsRunning: moving,
    },
    text: {
      typeShare: Object.fromEntries(Object.entries(sizes).map(([px, n]) => [px, `${Math.round((100 * n) / total)}%`])),
      contrastBelow4_5: lowContrast,
      textOnGlass: { count: glass.length, samples: glass.slice(0, 6) },
      readingBreaks,
      readingChecked: reading.length,
    },
    targetsUnder24px: smallTargets,
    headings,
    problems: { unlabelledFields: unlabelled, imagesWithoutAlt: noAlt, genericLinkText: genericLinks, blankLinksWithoutRel: unsafeBlank },
    sections,
  };
}
