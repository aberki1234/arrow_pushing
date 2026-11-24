/**
 * Check a reaction file against the reaction schema (schema/reaction.schema.json).
 *
 * The TypeScript counterpart of python/reaction_files/schema_violations.py; both must report the
 * same instance paths for the shared cases in fixtures/schema_cases/invalid_edits.json.
 *
 * Terms
 *   reaction document  One reaction file, parsed from JSON.
 *   schema violation   One place where the document breaks the schema: a JSON pointer to the
 *                      offending value (instance path, "" for the whole document) and a message.
 */
import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import reactionSchemaJson from "../../schema/reaction.schema.json";

/** `instancePath` is a JSON pointer such as "/steps/0/routePreference"; "" is the whole document. */
export interface SchemaViolation {
  readonly instancePath: string;
  readonly message: string;
}

export const reactionSchema: object = reactionSchemaJson;

// allErrors: report every violation, not only the first, as the Python validator does.
const validateReaction = new Ajv2020({ allErrors: true }).compile(reactionSchema);

function errorToViolation(error: ErrorObject): SchemaViolation {
  return { instancePath: error.instancePath, message: `${error.keyword}: ${error.message ?? ""}` };
}

/** Plain code-unit order, the same order Python's sorted() gives these ASCII paths. */
function compareText(first: string, second: string): number {
  if (first === second) {
    return 0;
  }
  return first < second ? -1 : 1;
}

function byPathThenMessage(first: SchemaViolation, second: SchemaViolation): number {
  return (
    compareText(first.instancePath, second.instancePath) ||
    compareText(first.message, second.message)
  );
}

/** Every schema violation in the document, sorted by instance path; empty if it is valid. */
export function schemaViolations(reactionDocument: unknown): SchemaViolation[] {
  if (validateReaction(reactionDocument)) {
    return [];
  }
  const violations = (validateReaction.errors ?? []).map(errorToViolation);
  const pathAndMessageToViolation = new Map(
    violations.map((violation) => [`${violation.instancePath}\n${violation.message}`, violation]),
  );
  return [...pathAndMessageToViolation.values()].sort(byPathThenMessage);
}
