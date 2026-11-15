import { readValidatedArtifact, packagedArtifact } from "./artifacts.js";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./contracts/mission-context.schema.json";
import type { MissionContext } from "./contracts/journey.js";

const validate = new Ajv2020().compile<MissionContext>(schema);
export function readMissionContext(path: string): MissionContext {
  return readValidatedArtifact(path, validate, "mission-context");
}
export const getMissionContext = packagedArtifact("mission_context.json", readMissionContext);
