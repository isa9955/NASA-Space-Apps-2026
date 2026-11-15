import { readValidatedArtifact, packagedArtifact } from "./artifacts.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./contracts/site.schema.json";
import type { AssessmentArtifact } from "./contracts/site.js";

const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(schema, "contract");
const validate = ajv.compile<AssessmentArtifact>({ $ref: "contract#/$defs/artifact" });

export function readAssessments(path: string): AssessmentArtifact {
  const parsed = readValidatedArtifact(path, validate, "assessment");
  const ids = parsed.sites.map((site) => site.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate assessment site IDs");
  return parsed;
}

export const getAssessments = packagedArtifact("site_assessments.json", readAssessments);
