const { mkdirSync, copyFileSync, unlinkSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { readAssessments } = require("../dist/src/assessments.js");
const root = resolve(__dirname, "..");
const source = resolve(root, "../pipeline/site_assessments.json");
const destination = join(root, "dist/data/site_assessments.json");
try { unlinkSync(destination); } catch (error) { if (error.code !== "ENOENT") throw error; }
readAssessments(source);
mkdirSync(join(root, "dist/data"), { recursive: true });
copyFileSync(source, destination);
console.log("Validated and packaged Phase 3 assessments (byte-for-byte copy).");
