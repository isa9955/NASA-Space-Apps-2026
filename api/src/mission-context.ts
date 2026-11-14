import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "./contracts/mission-context.schema.json";
import type { MissionContext } from "./contracts/journey.js";

const validate = new Ajv2020().compile<MissionContext>(schema);
export function readMissionContext(path: string): MissionContext {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!validate(parsed)) throw new Error("Invalid mission-context artifact");
  return parsed;
}
let cached: MissionContext | undefined;
export function getMissionContext(): MissionContext {
  return (cached ??= readMissionContext(
    join(__dirname, "../data/mission_context.json"),
  ));
}
