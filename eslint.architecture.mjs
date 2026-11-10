import path from "node:path";
import boundaries from "eslint-plugin-boundaries";

// The architecture rules of docs/frontend-plan.md section 3 and AGENTS.md section 13, as ESLint config.
// eslint.config.mjs applies them to web/src; web/tests/architecture.test.ts applies the same rules
// to a small fixture tree, so a change to a rule that stops it from catching a violation fails a test.

// Raw colours are not allowed outside @ember/ui: every colour comes from a design token.
const RAW_HEX = String.raw`/(^|[^&\w])#[0-9a-fA-F]{3,8}\b/`;
const RAW_HEX_MESSAGE = "No raw hex colours in feature code. Use a token from @ember/ui.";

// rootPath is the repo root the element patterns are relative to. It defaults to the working
// directory, which is right for `pnpm lint`; tests run from web/ and pass it explicitly.
export function architectureConfig({
  root = "web/src",
  tsconfig = "web/tsconfig.json",
  rootPath = process.cwd(),
} = {}) {
  const everywhere = [`${root}/**/*.{ts,tsx}`];
  const appCode = ["app", "features", "components", "providers", "lib"].map(
    (folder) => `${root}/${folder}/**/*.{ts,tsx}`,
  );

  return [
    {
      files: everywhere,
      plugins: { boundaries },
      settings: {
        "import/resolver": { typescript: { project: [path.resolve(rootPath, tsconfig)] } },
        "boundaries/root-path": rootPath,
        "boundaries/elements": [
          { type: "app", pattern: `${root}/app` },
          { type: "feature", pattern: `${root}/features/*`, capture: ["name"] },
          { type: "component", pattern: `${root}/components` },
          { type: "provider", pattern: `${root}/providers` },
          { type: "lib", pattern: `${root}/lib` },
        ],
      },
      rules: {
        "boundaries/dependencies": [
          "error",
          {
            default: "disallow",
            policies: [
              {
                from: { element: { type: "app" } },
                allow: [
                  { to: { element: { type: "feature", fileInternalPath: "index.{ts,tsx}" } } },
                  { to: { element: { types: ["app", "component", "provider", "lib"] } } },
                ],
              },
              {
                from: { element: { type: "feature" } },
                allow: [
                  { to: { element: { type: "feature", fileInternalPath: "index.{ts,tsx}" } } },
                  { to: { element: { types: ["component", "lib"] } } },
                ],
              },
              {
                from: { element: { type: "component" } },
                allow: { to: { element: { types: ["component", "provider", "lib"] } } },
              },
              {
                from: { element: { type: "provider" } },
                allow: { to: { element: { types: ["provider", "lib"] } } },
              },
              {
                from: { element: { type: "lib" } },
                allow: { to: { element: { type: "lib" } } },
              },
            ],
          },
        ],
        // Data comes from @ember/api hooks. Never reach into a package's src or into a mock folder.
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "(^|/)mock(/|$)|^@ember/[^/]+/src",
                message:
                  "Import data from @ember/api hooks. Never reach into a package's src or its mock folder.",
              },
            ],
          },
        ],
      },
    },
    {
      // Only the provider that starts the mock backend may import the mock.
      files: [`${root}/providers/**/*.{ts,tsx}`],
      rules: { "no-restricted-imports": "off" },
    },
    {
      files: appCode,
      ignores: ["**/*.test.{ts,tsx}"],
      rules: {
        "no-restricted-syntax": [
          "error",
          { selector: `Literal[value=${RAW_HEX}]`, message: RAW_HEX_MESSAGE },
          { selector: `TemplateElement[value.raw=${RAW_HEX}]`, message: RAW_HEX_MESSAGE },
        ],
      },
    },
  ];
}
