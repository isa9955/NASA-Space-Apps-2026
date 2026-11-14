import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./contracts/site.schema.json";
import type { AssessmentArtifact } from "./contracts/site.js";

const ajv = new Ajv2020({ allErrors: true });
ajv.addSchema(schema, "contract");
const validate = ajv.compile<AssessmentArtifact>({ $ref: "contract#/$defs/artifact" });

export function readAssessments(path: string): AssessmentArtifact {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!validate(parsed)) {
    throw new Error(`Invalid assessment artifact: ${ajv.errorsText(validate.errors)}`);
  }
  const ids = parsed.sites.map((site) => site.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate assessment site IDs");
  return parsed;
}

let cached: AssessmentArtifact | undefined;
export function getAssessments(): AssessmentArtifact {
  // Resolve relative to the compiled module, independent of the host working directory.
  const path = join(__dirname, "../data/site_assessments.json");
  cached ??= readAssessments(path);
  return cached;
}
