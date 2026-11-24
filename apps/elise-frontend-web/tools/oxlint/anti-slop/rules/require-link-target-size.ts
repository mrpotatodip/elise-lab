import { defineRule } from "@oxlint/plugins";

// A class that sets a height of 24px or more: `min-h-6` and up, `h-6` and up, or a button's own variants.
const TALL_ENOUGH =
  /(?:^|[\s:])(?:min-h-(?:[6-9]|1\d)|h-(?:[6-9]|1\d)|size-(?:[6-9]|1\d)|p-(?:[3-9]|1\d)|py-(?:[3-9]|1\d))(?:$|\s)/;

/** Every string literal and template chunk under an expression. */
const stringsIn = (node: unknown): readonly string[] => {
  if (typeof node !== "object" || node === null) return [];
  if ("type" in node && node.type === "Literal" && "value" in node)
    return typeof node.value === "string" ? [node.value] : [];
  if (
    "type" in node &&
    node.type === "TemplateElement" &&
    "value" in node &&
    typeof node.value === "object" &&
    node.value !== null &&
    "raw" in node.value
  )
    return [String(node.value.raw)];
  return Object.entries(node).flatMap(([key, child]) => {
    if (key === "parent" || key === "loc" || key === "range") return [];
    return Array.isArray(child) ? child.flatMap(stringsIn) : stringsIn(child);
  });
};

/** A link is at least 24px tall, so it is easy to hit (DESIGN.md, Text and spacing). */
export const requireLinkTargetSizeRule = defineRule({
  meta: {
    type: "problem",
    docs: { description: "Require `min-h-6` (or a taller height) on a `Link` or `a` in a feature module." },
    messages: {
      linkTooShort:
        "A link is at least 24px tall: add `min-h-6` with `inline-flex items-center` (DESIGN.md, Text and spacing).",
    },
  },
  createOnce(context) {
    // A class kept in a `const` of the same file counts as written at the link.
    const constants = new Map<string, string>();
    return {
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || node.init == null) return;
        if (node.init.type === "Literal" && typeof node.init.value === "string")
          constants.set(node.id.name, node.init.value);
        if (node.init.type === "TemplateLiteral") constants.set(node.id.name, context.sourceCode.getText(node.init));
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || (node.name.name !== "Link" && node.name.name !== "a")) return;
        const className = node.attributes.find(
          (attribute) =>
            attribute.type === "JSXAttribute" &&
            attribute.name.type === "JSXIdentifier" &&
            attribute.name.name === "className",
        );
        const source = className ? context.sourceCode.getText(className) : "";
        const direct = (source.match(/[A-Za-z_]\w*/g) ?? []).flatMap((word) => constants.get(word) ?? []);
        const fromConstants = [
          ...direct,
          ...direct.flatMap((text) => (text.match(/[A-Za-z_]\w*/g) ?? []).flatMap((word) => constants.get(word) ?? [])),
        ];
        const classes = [...(className ? stringsIn(className) : []), ...fromConstants].join(" ");
        // A shared class constant (`NAV_ITEM`) or `buttonVariants` sets the height elsewhere, so this file cannot say it is short.
        // A link inside a sentence is an inline link (WCAG 2.5.8 exempts it), and a stretched link or a screen-reader-only one has no box of its own to size.
        const element = node.parent;
        const container = element?.parent;
        const inSentence =
          container != null &&
          "children" in container &&
          Array.isArray(container.children) &&
          container.children.some(
            (child) =>
              (child.type === "JSXText" && child.value.trim() !== "") ||
              (child.type === "JSXExpressionContainer" &&
                (child.expression.type === "Literal" || child.expression.type === "TemplateLiteral")),
          );
        const insideRenderProp = element?.parent?.type === "JSXExpressionContainer";
        if (
          inSentence ||
          insideRenderProp ||
          /after:inset-0|sr-only/.test(classes) ||
          TALL_ENOUGH.test(classes) ||
          /buttonVariants/.test(source)
        )
          return;
        context.report({ node, messageId: "linkTooShort" });
      },
    };
  },
});
