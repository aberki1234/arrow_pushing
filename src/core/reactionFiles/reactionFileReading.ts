/**
 * Reading a reaction document as typed data (reactionFile.ts), after checking it against
 * schema/reaction.schema.json. A document that breaks the schema is not read: its schema
 * violations come back instead, and each caller decides what to do (the linter reports them; the
 * learner site and the catalogue build stop).
 *
 *   readReactionFile       the whole schema: a published reaction, or a draft ready to publish.
 *   readReactionMechanism  the start state, the states and the steps (each checked against the
 *                          schema's own state and step definitions), atom roles and abbreviated
 *                          groups; the rest of the document may be unfinished, and a new draft
 *                          may have one state and no steps yet.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import reactionSchemaJson from "../../../schema/reaction.schema.json";
import type { ReactionFile, ReactionMechanism } from "./reactionFile.js";
import {
  type SchemaViolation,
  schemaViolations,
  schemaViolationsFromErrors,
} from "./schemaViolations.js";

const REACTION_SCHEMA_ID = "urn:mech-training:schema:reaction:1";
const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(reactionSchemaJson);
const reactionPart = (pointer: string): object => ({ $ref: `${REACTION_SCHEMA_ID}#${pointer}` });
const validateMechanism = ajv.compile<ReactionMechanism>({
  type: "object",
  required: ["startStateId", "stateIdToState", "steps"],
  properties: {
    startStateId: reactionPart("/$defs/slug"),
    stateIdToState: {
      type: "object",
      propertyNames: reactionPart("/$defs/slug"),
      additionalProperties: reactionPart("/$defs/state"),
    },
    steps: { type: "array", items: reactionPart("/$defs/step") },
    atomRoleToMapNumbers: reactionPart("/properties/atomRoleToMapNumbers"),
    abbreviatedGroups: reactionPart("/properties/abbreviatedGroups"),
    spectatorMapNumbers: reactionPart("/properties/spectatorMapNumbers"),
  },
});

export type ReactionFileReading =
  { readonly reactionFile: ReactionFile } | { readonly schemaViolations: SchemaViolation[] };

export type ReactionMechanismReading =
  | { readonly reactionMechanism: ReactionMechanism }
  | { readonly schemaViolations: SchemaViolation[] };

/** The document as a reaction file, or why it breaks the schema. */
export function readReactionFile(reactionDocument: unknown): ReactionFileReading {
  const violations = schemaViolations(reactionDocument);
  return violations.length === 0
    ? { reactionFile: reactionDocument as ReactionFile }
    : { schemaViolations: violations };
}

/** The document's mechanism, or why its mechanism breaks the schema. */
export function readReactionMechanism(reactionDocument: unknown): ReactionMechanismReading {
  return validateMechanism(reactionDocument)
    ? { reactionMechanism: reactionDocument }
    : { schemaViolations: schemaViolationsFromErrors(validateMechanism.errors ?? []) };
}
