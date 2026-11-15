const { mkdirSync, copyFileSync, unlinkSync, existsSync, readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { resolve, join } = require("node:path");
const { readAssessments } = require("../dist/src/assessments.js");
const { readRoutes } = require("../dist/src/routes.js");
const { readMissionContext } = require("../dist/src/mission-context.js");
const { readRegionalAnalysis } = require("../dist/src/regional-analysis.js");
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
const regionSource = resolve(root, "../pipeline/deuteronilus_analysis.json");
const regionDestination = join(root, "dist/data/deuteronilus_analysis.json");
try { unlinkSync(regionDestination); } catch (error) { if (error.code !== "ENOENT") throw error; }
if (existsSync(regionSource)) {
  const analysis = readRegionalAnalysis(regionSource);
  // Build-time integrity only. No raw processing code/grids are loaded by Functions.
  const files = {
    metadataSha256: "../../../api/mars-blindspots/data/deuteronilus/metadata.json",
    gridSha256: "../../../api/mars-blindspots/data/deuteronilus/data_grid.json",
    zonesSha256: "../../../api/mars-blindspots/data/deuteronilus/zones.json",
    routingSha256: "../../../api/mars-blindspots/backend/routing.py",
    sourceAuditSha256: "../pipeline/deuteronilus_source.json",
  };
  for (const [key, file] of Object.entries(files)) {
    // Python code is hashed with LF, matching its Git representation on every OS.
    const raw = readFileSync(resolve(root, file));
    const bytes = file.endsWith(".py") ? Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n")) : raw;
    if (createHash("sha256").update(bytes).digest("hex") !== analysis.inputProvenance[key])
      throw new Error(`Stale Deuteronilus analysis: ${key}; regenerate offline`);
  }
  copyFileSync(regionSource, regionDestination);
} else console.warn("Optional Deuteronilus analysis absent; Arcadia remains available.");
console.log("Validated and packaged scientific assessments and precomputed routes (byte-for-byte copies).");
