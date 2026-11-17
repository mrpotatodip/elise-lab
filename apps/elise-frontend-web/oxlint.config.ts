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
const FORBID_HONO_RPC = { name: "hono/client", message: "No Hono RPC client: call the backend through a server function (React 3.1)." };
const SHARED_IMPORT_RULES = [
  { group: ["@/*"], message: "Use the `#/` alias (React 1.4)." },
  {
    group: ["#/modules/*/*", "#/modules/*/*/*", "!#/modules/auth/server/session"],
    message: "Import another module through its root barrel, `#/modules/{module}`. Inside a module, import siblings with a relative path (React 1.3).",
  },
];

const forbidModules = (files: string, modules: readonly string[], message: string): OxlintOverride => ({
  files: [files],
  rules: {
    "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: [...SHARED_IMPORT_RULES, { group: modules.flatMap((name) => [`#/modules/${name}`, `#/modules/${name}/*`]), message }] }],
  },
});

export default defineConfig({
  ignorePatterns: ["tools/oxlint/anti-slop/**", "src/routeTree.gen.ts", "worker-configuration.d.ts"],
  plugins: ["typescript", "unicorn", "oxc", "react", "jsx-a11y", "react-perf", "vitest", "import"],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  overrides: [
    forbidModules("src/modules/shell/**", ["scan", "repo", "finding", "team", "usage", "summary"], "The shell is the frame every screen sits in, so it cannot import a screen's module. Take what it needs as props."),
    forbidModules("src/modules/scan/**", ["repo", "finding", "team", "summary"], "The scan module sits below repo and finding. Take their parts as props or slots from the route that composes them."),
    forbidModules("src/modules/usage/**", ["scan", "repo", "finding", "team", "summary"], "The usage module sits below the screens that show it."),
    forbidModules("src/modules/finding/**", ["repo", "summary"], "The finding module sits below repo."),
    {
      files: ["src/modules/*/components/**", "src/modules/*/hooks/**", "src/routes/**"],
      rules: {
        "anti-slop/no-engine-client-import": "error",
      },
    },
    {
      files: ["src/modules/**"],
      excludeFiles: ["src/modules/**/__tests__/**"],
      rules: {
        "anti-slop/no-raw-colors": "error",
      },
    },
    {
      files: ["src/modules/*/api/**"],
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
      // A shadcn primitive: importing the shell's root barrel would make
      // components/ui and the shell import each other.
      // -----
      files: ["src/components/ui/sonner.tsx"],
      rules: {
        "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: [SHARED_IMPORT_RULES[0]] }],
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
        "vitest/no-restricted-matchers": ["error", { toMatchSnapshot: "No snapshot tests (General 2.2).", toMatchInlineSnapshot: "No snapshot tests (General 2.2)." }],
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
    "no-restricted-imports": ["error", { paths: [FORBID_HONO_RPC], patterns: SHARED_IMPORT_RULES }],
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
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
