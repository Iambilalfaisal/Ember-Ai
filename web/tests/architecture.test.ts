// @vitest-environment node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { architectureConfig } from "../../eslint.architecture.mjs";

// The architecture rules (AGENTS.md section 13) are only worth anything if a violation really
// fails lint. These tests run the same rules as `pnpm lint` against a miniature web/src.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FIXTURES = "web/tests/fixtures/src";

const eslint = new ESLint({
  cwd: repoRoot,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
    ...architectureConfig({ root: FIXTURES, rootPath: repoRoot }),
  ],
});

async function ruleIdsFor(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, FIXTURES, file) });
  return (result?.messages ?? []).map((message) => message.ruleId ?? "parse-error");
}

const BOUNDARY = "boundaries/dependencies";

describe("features", () => {
  it("may import another feature through its index.ts", async () => {
    expect(
      await ruleIdsFor(
        "features/beta/uses.ts",
        `import { secret } from "../alpha";\nexport const value = secret;\n`,
      ),
    ).toEqual([]);
  });

  it("must not import another feature's internals", async () => {
    expect(
      await ruleIdsFor(
        "features/beta/uses.ts",
        `import { secret } from "../alpha/components/Secret";\nexport const value = secret;\n`,
      ),
    ).toEqual([BOUNDARY]);
  });

  it("may import its own internals", async () => {
    expect(
      await ruleIdsFor(
        "features/alpha/other.ts",
        `import { secret } from "./components/Secret";\nexport const value = secret;\n`,
      ),
    ).toEqual([]);
  });

  it("may use app-level components and lib", async () => {
    expect(
      await ruleIdsFor(
        "features/beta/uses.ts",
        `import { card } from "../../components/Card";\nimport { format } from "../../lib/format";\nexport const value = [card, format];\n`,
      ),
    ).toEqual([]);
  });

  it("must not import from app routes", async () => {
    expect(
      await ruleIdsFor(
        "features/beta/uses.ts",
        `import { page } from "../../app/page";\nexport const value = page;\n`,
      ),
    ).toEqual([BOUNDARY]);
  });
});

describe("app routes", () => {
  it("may render a feature through its index.ts", async () => {
    expect(
      await ruleIdsFor(
        "app/route.ts",
        `import { beta } from "../features/beta";\nexport const value = beta;\n`,
      ),
    ).toEqual([]);
  });

  it("must not import a feature's internals", async () => {
    expect(
      await ruleIdsFor(
        "app/route.ts",
        `import { secret } from "../features/alpha/components/Secret";\nexport const value = secret;\n`,
      ),
    ).toEqual([BOUNDARY]);
  });
});

describe("components", () => {
  it("must not import a feature", async () => {
    expect(
      await ruleIdsFor(
        "components/Bar.ts",
        `import { beta } from "../features/beta";\nexport const value = beta;\n`,
      ),
    ).toEqual([BOUNDARY]);
  });
});

describe("the mock backend", () => {
  it("is not importable from components", async () => {
    expect(
      await ruleIdsFor(
        "components/Bar.ts",
        `import { db } from "../lib/mock/db";\nexport const value = db;\n`,
      ),
    ).toEqual(["no-restricted-imports"]);
  });

  it("is not importable by reaching into a package's src", async () => {
    expect(
      await ruleIdsFor(
        "components/Bar.ts",
        `import { startWorker } from "@ember/api/src/mock";\nexport const value = startWorker;\n`,
      ),
    ).toContain("no-restricted-imports");
  });

  it("may be started by a provider", async () => {
    expect(
      await ruleIdsFor(
        "providers/Start.ts",
        `import { db } from "../lib/mock/db";\nexport const value = db;\n`,
      ),
    ).toEqual([]);
  });
});

describe("colours", () => {
  it("must not be raw hex values in feature code", async () => {
    expect(await ruleIdsFor("features/beta/Tile.ts", `export const colour = "#e9a23b";\n`)).toEqual(
      ["no-restricted-syntax"],
    );
    expect(
      await ruleIdsFor("features/beta/Tile.ts", "export const className = `bg-[#fff]`;\n"),
    ).toEqual(["no-restricted-syntax"]);
  });

  it("are not confused with page anchors", async () => {
    expect(await ruleIdsFor("features/beta/Tile.ts", `export const href = "#content";\n`)).toEqual(
      [],
    );
  });

  it("are not checked in tests", async () => {
    expect(
      await ruleIdsFor("features/beta/Tile.test.ts", `export const colour = "#fff";\n`),
    ).toEqual([]);
  });
});
