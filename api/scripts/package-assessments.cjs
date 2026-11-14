const { mkdirSync, copyFileSync, unlinkSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { readAssessments } = require("../dist/src/assessments.js");
const { readRoutes } = require("../dist/src/routes.js");
const { readMissionContext } = require("../dist/src/mission-context.js");
const root = resolve(__dirname, "..");
const source = resolve(root, "../pipeline/site_assessments.json");
const destination = join(root, "dist/data/site_assessments.json");
const routeSource = resolve(root, "../pipeline/routes.geojson");
const routeDestination = join(root, "dist/data/routes.geojson");
try { unlinkSync(routeDestination); } catch (error) { if (error.code !== "ENOENT") throw error; }
try { unlinkSync(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
readAssessments(source);
readRoutes(routeSource, source);
mkdirSync(join(root, "dist/data"), { recursive: true });
copyFileSync(source, destination);
copyFileSync(routeSource, routeDestination);
const missionSource = resolve(root, "../pipeline/mission_context.json");
const missionDestination = join(root, "dist/data/mission_context.json");
try { unlinkSync(missionDestination); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (existsSync(missionSource)) {
  readMissionContext(missionSource);
  copyFileSync(missionSource, missionDestination);
} else console.warn("Optional THEMIS mission context absent; MOLA site and route data remain available.");
console.log("Validated and packaged scientific assessments and precomputed routes (byte-for-byte copies).");
