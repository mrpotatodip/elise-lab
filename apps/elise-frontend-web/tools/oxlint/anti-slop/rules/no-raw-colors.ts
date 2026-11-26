import { defineRule } from "@oxlint/plugins";

const PALETTE =
  "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone";
const RAW_PALETTE_CLASS = new RegExp(`(?:^|[\\s:])(?:[a-z]+-)?(?:${PALETTE})-\\d{2,3}(?:/\\d+)?(?:$|\\s)`);
const RAW_HEX_COLOR = /^#[0-9a-fA-F]{3,8}$|\[#[0-9a-fA-F]{3,8}\]/;

/** Colors come from theme tokens, never a hex value or a raw palette class (CODING_STANDARDS React 7.3). */
export const noRawColorsRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Disallow hex colors and raw Tailwind palette classes in a feature module.",
    },
    messages: {
      rawColor: "Use a theme token (`text-foreground/60`, `bg-card`, `text-destructive`), not `{{value}}`.",
    },
  },
  createOnce(context) {
    const rawColorIn = (value: string) =>
      value.split(/\s+/).find((word) => RAW_HEX_COLOR.test(word) || RAW_PALETTE_CLASS.test(` ${word} `));
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        const found = rawColorIn(node.value);
        if (found) context.report({ node, messageId: "rawColor", data: { value: found } });
      },
      TemplateElement(node) {
        const found = rawColorIn(node.value.cooked ?? node.value.raw);
        if (found) context.report({ node, messageId: "rawColor", data: { value: found } });
      },
    };
  },
});
