// Lint and complexity rules for TypeScript, the user's standard limits
// (see "Code conventions" in ~/.claude/CLAUDE.md): complexity 12, 6 parameters, 40 statements,
// 50 lines per function, 500 lines per file, 100 characters per line, no single-letter names
// except loop indices. Layout is Prettier's job (make format); eslint-config-prettier, last in
// the list, turns off the layout rules that would disagree with it.
import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import sveltePlugin from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

const sizeAndComplexityRules = {
  complexity: ["error", 12],
  "max-params": ["error", 6],
  "max-statements": ["error", 40],
  "max-lines-per-function": ["error", { max: 50 }],
  "max-lines": ["error", { max: 500 }],
  "id-length": ["error", { min: 2, exceptions: ["i", "j", "k"], properties: "never" }],
};

// Prettier wraps code at 100 characters but cannot split a long string or comment; this rule
// catches those. It must come after eslintConfigPrettier, which would otherwise switch it off.
const lineLengthRule = {
  "max-len": ["error", { code: 100, ignoreUrls: true, ignoreRegExpLiterals: true }],
};

export default tseslint.config(
  { ignores: ["node_modules", "dist", "build", "mockups", "docs", ".dependency-cruiser.cjs"] },
  eslint.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { globals: globals.node },
    rules: sizeAndComplexityRules,
  },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      ...sizeAndComplexityRules,
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "default", format: ["camelCase"] },
        { selector: "variable", format: ["camelCase", "UPPER_CASE"] },
        { selector: "typeLike", format: ["PascalCase"] },
        { selector: "enumMember", format: ["PascalCase"] },
        // JSON keys and library option names are written as they are, e.g. "$schema".
        { selector: "property", modifiers: ["requiresQuotes"], format: null },
        { selector: "import", format: ["camelCase", "PascalCase"] },
      ],
    },
  },
  // Svelte components: the same limits and naming, with TypeScript in <script lang="ts">.
  ...sveltePlugin.configs.recommended,
  {
    files: ["**/*.svelte"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: [".svelte"],
        parser: tseslint.parser,
      },
    },
    rules: {
      ...sizeAndComplexityRules,
      // Inline event handlers in the markup are expressions; functions in <script> need types.
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
    },
  },
  eslintConfigPrettier,
  ...sveltePlugin.configs.prettier,
  { rules: lineLengthRule },
);
