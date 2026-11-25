// Import rules for the TypeScript code under src/.
// Folders under src/, lowest layer first: a folder may import only folders listed before it. Add
// each new folder here. testSupport/ is for tests only.
const layersLowestFirst = [
  "arrowNotation",
  "stateGraphs",
  "chemistryToolkit",
  "attemptAssessment",
  "reactionFiles",
  "reactionLinting",
  "catalogue",
  "catalogueBuilding",
  "reactionDatabase",
  "moleculeDrawing",
  "stepSession",
  "reactionEditing",
  "learnerProgress",
  "dailyPuzzle",
  "learnerStatistics",
  "siteData",
  "learnerSite",
  "reactionEditor",
  "editorFileServer",
];

const layerRules = layersLowestFirst.slice(0, -1).map((layer, position) => ({
  name: `layer-${layer}`,
  severity: "error",
  comment: `${layer} may import only the layers listed before it.`,
  from: { path: `^src/${layer}/` },
  to: { path: `^src/(${layersLowestFirst.slice(position + 1).join("|")})/` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...layerRules,
    {
      name: "unknown-layer",
      severity: "error",
      comment: "Every folder under src/ must be listed in layersLowestFirst (or be testSupport).",
      from: { path: "^src/", pathNot: `^src/(${layersLowestFirst.join("|")}|testSupport)/` },
      to: {},
    },
    {
      name: "learner-site-never-loads-node-tools",
      severity: "error",
      comment:
        "The learner site stays small and static: RDKit.js, the linter and the catalogue build " +
        "(Node tools, later the editor) must not be reachable from its entry point.",
      from: { path: "^src/learnerSite/main\\.ts$" },
      to: {
        path: "^src/(chemistryToolkit|reactionLinting|catalogueBuilding|reactionEditing|reactionEditor|editorFileServer)/",
        reachable: true,
      },
    },
    {
      name: "test-support-only-in-tests",
      severity: "error",
      comment: "testSupport/ reads fixture files with node:fs; shipped code must not import it.",
      from: { path: "^src", pathNot: ["\\.test\\.ts$", "^src/testSupport/"] },
      to: { path: "^src/testSupport/" },
    },
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
      comment:
        "Code that ships must not import test or build tools; tests and testSupport/ (only " +
        "reachable from tests, see test-support-only-in-tests) may.",
      from: { path: "^src", pathNot: ["\\.test\\.ts$", "^src/testSupport/"] },
      to: { dependencyTypes: ["npm-dev"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
