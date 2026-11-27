// Import rules for the TypeScript code under src/ (see docs/code-layout.md).
// Each list runs lowest first, and the same rule holds at every level: a tier may import only the
// tiers before it, a folder only the folders before it in its tier (and earlier tiers), and a
// subfolder only the subfolders before it in its folder. Files in one subfolder (or in a folder
// without subfolders) may import each other. Add each new folder or subfolder here.
// testSupport/ is for tests only.
const tiersLowestFirst = [
  [
    "core",
    [
      "arrowNotation",
      "stateGraphs",
      "attemptAssessment",
      "reactionFiles",
      "trackFiles",
      "catalogue",
    ],
  ],
  ["drawing", ["moleculeDrawing"]],
  [
    "learner",
    [
      "stepSession",
      "learnerProgress",
      "dailyPuzzle",
      "learnerStatistics",
      "learnTracks",
      "siteData",
      "learnerSite",
    ],
  ],
  [
    "tooling",
    ["chemistryToolkit", "reactionLinting", "catalogueBuilding", "draftSync", "buildTools"],
  ],
  ["create", ["reactionEditing", "reactionEditor", "editorFileServer"]],
  ["server", ["reactionDatabase", "backendServer"]],
];

// Folders with ordered subfolders (folders of 10 or more files). Such a folder keeps no files of
// its own: every file sits in one of its subfolders.
const folderToSubfoldersLowestFirst = {
  "drawing/moleculeDrawing": ["shared", "state", "scheme"],
  "tooling/reactionLinting": ["findings", "rules", "tracks", "shell"],
  "learner/learnerSite": ["model", "components", "io", "workspaces", "pages", "app"],
  "create/reactionEditor": ["model", "components", "io", "workspaces", "pages", "app"],
  "create/reactionEditing": ["draft", "mechanism", "outline", "teaching", "publishing", "review"],
};

const foldersLowestFirst = tiersLowestFirst.flatMap(([tier, folders]) =>
  folders.map((folder) => `${tier}/${folder}`),
);

function orderRules(kind, parent, namesLowestFirst) {
  return namesLowestFirst.slice(0, -1).map((name, position) => ({
    name: `${kind}-${parent}${name}`,
    severity: "error",
    comment: `${parent}${name} may import only the ${kind}s listed before it.`,
    from: { path: `^src/${parent}${name}/` },
    to: { path: `^src/${parent}(${namesLowestFirst.slice(position + 1).join("|")})/` },
  }));
}

const tierRules = orderRules(
  "tier",
  "",
  tiersLowestFirst.map(([tier]) => tier),
);
const folderRules = orderRules("folder", "", foldersLowestFirst);
const subfolderRules = Object.entries(folderToSubfoldersLowestFirst).flatMap(
  ([folder, subfolders]) => [
    ...orderRules("subfolder", `${folder}/`, subfolders),
    {
      name: `unknown-subfolder-${folder}`,
      severity: "error",
      comment: `Every file in ${folder} sits in a subfolder listed for it.`,
      from: { path: `^src/${folder}/`, pathNot: `^src/${folder}/(${subfolders.join("|")})/` },
      to: {},
    },
  ],
);

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    ...tierRules,
    ...folderRules,
    ...subfolderRules,
    {
      name: "unknown-folder",
      severity: "error",
      comment: "Every folder under src/ must be listed in tiersLowestFirst (or be testSupport).",
      from: { path: "^src/", pathNot: `^src/(${foldersLowestFirst.join("|")}|testSupport)/` },
      to: {},
    },
    {
      name: "learner-site-never-loads-node-tools",
      severity: "error",
      comment:
        "The learner site stays small and static: RDKit.js, the linter, the catalogue build, " +
        "Create and the server must not be reachable from its entry point. The tier order " +
        "already forbids this; this rule says why.",
      from: { path: "^src/learner/learnerSite/app/main\\.ts$" },
      to: { path: "^src/(tooling|create|server)/", reachable: true },
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
