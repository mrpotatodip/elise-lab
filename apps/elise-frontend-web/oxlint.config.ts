import { readdirSync } from "node:fs";
import { defineConfig, type OxlintOverride } from "oxlint";

// -----
// Modules import in one direction only: shell and usage at the bottom, then scan,
// then finding, then repo, then summary. A lower module that imports a higher one makes a cycle,
// so the file that needs both (a route) composes them and passes the parts down.
// -----
// -----
// Restricted imports. A later override replaces the rule for its files, so each
// override repeats SHARED_IMPORT_RULES.
// -----
const FORBID_HONO_RPC = {
  name: "hono/client",
  message: "No Hono RPC client: call the backend through a server function (React 3.1).",
};
const SHARED_IMPORT_RULES = [
  { group: ["@/*"], message: "Use the `#/` alias (React 1.4)." },
  {
    group: ["#/modules/*/*", "#/modules/*/*/*", "!#/modules/auth/server/session"],
    message:
      "Import another module through its root barrel, `#/modules/{module}`. Inside a module, import siblings with a relative path (React 1.3).",
  },
];

// -----
// Source providers (docs/adr/0008-git-providers.md): modules read a provider
// only through `#/providers/port` and `#/providers/registry`, a provider
// imports only the port and its own folder, and only the registry imports
// every provider. The `**/` form also catches a relative path. Each folder
// under src/providers gets its own override, so a new provider is covered as
// soon as its folder exists.
// -----
const FORBID_PROVIDER_IN_CORE = {
  group: ["**/providers/*", "**/providers/*/**", "!**/providers/port", "!**/providers/registry"],
  message:
    "Modules read a provider only through `#/providers/registry` and `#/providers/port`, never its folder (ADR 0008).",
};
const CORE_IMPORT_RULES = [...SHARED_IMPORT_RULES, FORBID_PROVIDER_IN_CORE];
const PROVIDER_IDS = readdirSync(new URL("src/providers", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
const providerOverride = (id: string): OxlintOverride => ({
  files: [`src/providers/${id}/**`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [FORBID_HONO_RPC],
        patterns: [
          ...SHARED_IMPORT_RULES,
          {
            group: [
              "../**",
              "**/providers/*",
              "**/providers/*/**",
              "!**/providers/port",
              `!**/providers/${id}`,
              `!**/providers/${id}/**`,
            ],
            message:
              "A provider imports only `#/providers/port` and its own folder: never the registry or another provider (ADR 0008).",
          },
        ],
      },
    ],
  },
});

const forbidModules = (files: string, modules: readonly string[], message: string): OxlintOverride => ({
  files: [files],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [FORBID_HONO_RPC],
        patterns: [
          ...CORE_IMPORT_RULES,
          { group: modules.flatMap((name) => [`#/modules/${name}`, `#/modules/${name}/*`]), message },
        ],
      },
    ],
  },
});

// -----
// No React effect hooks (React 6.1). A file that really syncs with something outside React,
// with no value to read, is listed here with what it syncs with. The last two are
// still to be rewritten: shrink this list, never grow it without a reason in review.
// -----
const EFFECT_FILES = [
  "src/lib/use-window-event.ts", // a window event listener
  "src/modules/shell/hooks/use-sky-rotation.ts", // a DOM animation, an idle timer and input listeners
  "src/modules/scan/hooks/use-refresh-on-finish.ts", // to move into the scan status query
  "src/modules/team/components/team-invite-invalid.tsx", // to move into the route's head
];

export default defineConfig({
  ignorePatterns: ["tools/oxlint/anti-slop/**", "src/routeTree.gen.ts", "worker-configuration.d.ts"],
  plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y", "react-perf", "vitest", "import"],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  jsPlugins: [{ name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" }],
  overrides: [
    forbidModules(
      "src/modules/shell/**",
      ["scan", "repo", "finding", "team", "usage", "summary"],
      "The shell is the frame every screen sits in, so it cannot import a screen's module. Take what it needs as props.",
    ),
    forbidModules(
      "src/modules/scan/**",
      ["repo", "finding", "team", "summary"],
      "The scan module sits below repo and finding. Take their parts as props or slots from the route that composes them.",
    ),
    forbidModules(
      "src/modules/usage/**",
      ["scan", "repo", "finding", "team", "summary"],
      "The usage module sits below the screens that show it.",
    ),
    forbidModules("src/modules/finding/**", ["repo", "summary"], "The finding module sits below repo."),
    {
      files: EFFECT_FILES,
      rules: { "anti-slop/no-use-effect": "off" },
    },
    {
      files: [
        "src/modules/*/components/**",
        "src/modules/*/hooks/**",
        "src/providers/*/components/**",
        "src/providers/*/hooks/**",
        "src/routes/**",
      ],
      rules: {
        "anti-slop/no-engine-client-import": "error",
      },
    },
    {
      files: ["src/modules/**", "src/providers/**"],
      excludeFiles: ["src/modules/**/__tests__/**"],
      rules: {
        "anti-slop/no-raw-colors": "error",
        "anti-slop/no-off-design-classes": "error",
        "anti-slop/require-link-target-size": "error",
      },
    },
    {
      files: ["src/modules/*/api/**", "src/providers/*/api/**"],
      rules: {
        "anti-slop/require-imported-server-fn-schema": "error",
      },
    },
    {
      files: ["src/modules/auth/api/**"],
      rules: {
        "anti-slop/require-server-fn-session": "off",
      },
    },
    {
      // -----
      // The theme picker paints a swatch of each theme's own colors, so they
      // cannot come from the active theme's tokens.
      // -----
      files: ["src/modules/shell/components/shell-theme-switch.tsx"],
      rules: {
        "anti-slop/no-raw-colors": "off",
      },
    },
    {
      // -----
      // The sidebar rows take their class from `NAV_ROW` and `TREE_LINK` in other files, and `NAV_ROW` is 40px tall.
      // -----
      files: ["src/modules/shell/components/shell-sidebar.tsx", "src/modules/shell/components/shell-settings-nav.tsx"],
      rules: {
        "anti-slop/require-link-target-size": "off",
      },
    },
    {
      // -----
      // These render links inside running prose (a report, a comment), where a link is inline and WCAG 2.5.8 exempts it from the 24px size.
      // -----
      files: [
        "src/modules/scan/components/scan-markdown.tsx",
        "src/modules/finding-comment/components/finding-comment-body.tsx",
      ],
      rules: {
        "anti-slop/require-link-target-size": "off",
      },
    },
    {
      // -----
      // A finding opened from a link gets a 3px accent edge, which no elevation token draws.
      // -----
      files: ["src/modules/summary/components/summary-findings.tsx"],
      rules: {
        "anti-slop/no-off-design-classes": "off",
      },
    },
    {
      // -----
      // A shadcn primitive: importing the shell's root barrel would make
      // components/ui and the shell import each other.
      // -----
      files: ["src/components/ui/sonner.tsx"],
      rules: {
        "no-restricted-imports": [
          "error",
          { paths: [FORBID_HONO_RPC], patterns: [SHARED_IMPORT_RULES[0], FORBID_PROVIDER_IN_CORE] },
        ],
      },
    },
    ...PROVIDER_IDS.map(providerOverride),
    {
      files: ["src/providers/registry.ts"],
      rules: {
        "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: SHARED_IMPORT_RULES }],
      },
    },
    {
      // -----
      // `interface Register` is how TanStack Router's types are extended.
      // -----
      files: ["src/router.tsx"],
      rules: {
        "typescript/consistent-type-definitions": "off",
      },
    },
    {
      files: ["**/__tests__/**"],
      rules: {
        "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: [SHARED_IMPORT_RULES[0]] }],
        "no-console": "error",
        "vitest/expect-expect": "error",
        "vitest/no-conditional-expect": "error",
        "vitest/no-disabled-tests": "error",
        "vitest/no-focused-tests": "error",
        "vitest/no-identical-title": "error",
        "vitest/no-restricted-matchers": [
          "error",
          {
            toMatchSnapshot: "No snapshot tests (General 2.2).",
            toMatchInlineSnapshot: "No snapshot tests (General 2.2).",
          },
        ],
      },
    },
  ],
  rules: {
    "react/react-in-jsx-scope": "off",
    "anti-slop/no-template-literal-class-name": "error",
    "anti-slop/require-server-fn-session": "error",
    "typescript/consistent-type-definitions": ["error", "type"],
    "typescript/no-explicit-any": "error",
    "import/no-default-export": "error",
    "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: CORE_IMPORT_RULES }],
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-deprecated-query-client-calls": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unlisted-comments": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-use-effect": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
