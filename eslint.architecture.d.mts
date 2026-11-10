import type { Linter } from "eslint";

export function architectureConfig(options?: {
  root?: string;
  tsconfig?: string;
  rootPath?: string;
}): Linter.Config[];
