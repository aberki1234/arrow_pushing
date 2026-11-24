// Import rules for the TypeScript code under src/ (the counterpart of tools/check_layers.py).
// Layers will be added here as folders under src/ appear, lowest first, like [tool.layers] in pyproject.toml.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-import-cycles",
      severity: "error",
      comment: "Modules must not import each other in a cycle.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-dev-dependencies-in-shipped-code",
      severity: "error",
      comment: "Code that ships to the browser must not import test or build tools.",
      from: { path: "^src", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
