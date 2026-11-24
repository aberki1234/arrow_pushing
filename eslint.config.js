// Lint and complexity rules for TypeScript, matching the Python limits in pyproject.toml
// (see "Code conventions" in ~/.claude/CLAUDE.md): complexity 12, 6 parameters, 40 statements,
// 50 lines per function, 500 lines per file, no single-letter names except loop indices.
import eslint from "@eslint/js";
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
);
