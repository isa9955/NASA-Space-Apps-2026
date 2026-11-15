import { readValidatedArtifact, packagedArtifact } from "./artifacts.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./contracts/region.schema.json";
import type { RegionalAnalysis } from "./contracts/region.js";

const ajv = new Ajv2020({ allErrors: true });
const validate = ajv.compile<RegionalAnalysis>(schema);

export function readRegionalAnalysis(path: string): RegionalAnalysis {
  const parsed = readValidatedArtifact(path, validate, "regional analysis");
  if (new Set(parsed.routes.map((route) => route.properties.mode)).size !== 2)
    throw new Error("Regional analysis must contain both distinct routing modes");
  return parsed;
}

export const getRegionalAnalysis = packagedArtifact("deuteronilus_analysis.json", readRegionalAnalysis);
