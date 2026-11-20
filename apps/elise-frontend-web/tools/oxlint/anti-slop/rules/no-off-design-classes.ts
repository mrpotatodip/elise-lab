import { defineRule } from "@oxlint/plugins";

// The one font size set DESIGN.md allows as an arbitrary value, in px: labels, code, card titles, page titles, numbers.
const ALLOWED_TEXT_PX = new Set([12, 13, 15, 26, 28, 32, 40]);

type ClassProblem = { readonly pattern: RegExp; readonly message: string };

const CLASS_PROBLEMS: readonly ClassProblem[] = [
  { pattern: /^(?:[a-z-]+:)*max-w-prose$/, message: "Use `max-w-copy` (52ch). `max-w-prose` runs 71 to 80 letters a line (DESIGN.md, Text and spacing)." },
  { pattern: /^(?:[a-z-]+:)*shadow-(?:sm|md|lg|xl|2xl|inner)$/, message: "Use an elevation token: `shadow-card`, `shadow-raised`, `shadow-control` or `shadow-primary` (DESIGN.md, Tokens)." },
  { pattern: /^(?:[a-z-]+:)*shadow-\[/, message: "Use an elevation token: `shadow-card`, `shadow-raised`, `shadow-control` or `shadow-primary` (DESIGN.md, Tokens)." },
  { pattern: /^(?:[a-z-]+:)*rounded(?:-[a-z]+)?-\[/, message: "Use the radius family: `rounded-lg` for controls, `rounded-xl` for cards, `rounded-full` for pills (DESIGN.md, Tokens)." },
  { pattern: /^(?:[a-z-]+:)*bg-status-(?:success|danger|warning|info|neutral)$/, message: "A status ink is text. Fill with `bg-status-x-soft`, or `bg-mark-x` for a shape (DESIGN.md, Tokens)." },
  { pattern: /^(?:[a-z-]+:)*(?:bg|text|border)-mark-[a-z-]+\/\d+$/, message: "A mark is opaque. Never fill a shape with a mark or ink at partial opacity (DESIGN.md, Tokens)." },
  { pattern: /^(?:[a-z-]+:)*text-mark-/, message: "A mark is a shape. Text takes `text-status-x` or `text-severity-x` (DESIGN.md, Tokens)." },
];

const ARBITRARY_TEXT_PX = /^(?:[a-z-]+:)*text-\[(\d+(?:\.\d+)?)px\]$/;

/** The words in a class string that break a rule of DESIGN.md. */
const problemsIn = (value: string): readonly string[] =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const found = CLASS_PROBLEMS.find((problem) => problem.pattern.test(word));
      if (found) return [`\`${word}\`: ${found.message}`];
      const px = ARBITRARY_TEXT_PX.exec(word);
      if (px && !ALLOWED_TEXT_PX.has(Number(px[1]))) return [`\`${word}\`: use \`text-xs\` (12px), \`text-sm\` or a size DESIGN.md lists (12, 13, 15, 26, 28, 32, 40).`];
      return [];
    });

/** Classes and icon strokes follow the tokens in DESIGN.md. */
export const noOffDesignClassesRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject classes that contradict DESIGN.md: off-scale text sizes, raw shadows, ink used as a fill, a mark at partial opacity, `max-w-prose`, an icon stroke other than 1.5.",
    },
    messages: {
      offDesign: "{{detail}}",
      iconStroke: "Icons use one stroke, 1.5, set once for every `svg.lucide` in globals.css. Remove `strokeWidth` or set it to 1.5 (DESIGN.md, Tokens).",
    },
  },
  createOnce(context) {
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        for (const detail of problemsIn(node.value)) context.report({ node, messageId: "offDesign", data: { detail } });
      },
      TemplateElement(node) {
        for (const detail of problemsIn(node.value.cooked ?? node.value.raw)) context.report({ node, messageId: "offDesign", data: { detail } });
      },
      JSXAttribute(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "strokeWidth") return;
        const container = node.value;
        if (container?.type !== "JSXExpressionContainer" || container.expression.type !== "Literal") return;
        if (container.expression.value !== 1.5) context.report({ node, messageId: "iconStroke" });
      },
    };
  },
});
