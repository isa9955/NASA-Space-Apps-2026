// Build-only staging. This neither provisions resources nor publishes to Azure.
const { readFileSync, writeFileSync, copyFileSync, cpSync, mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const { root, resetGeneratedDirectory } = require("./build-paths.cjs");

if (!process.env.npm_execpath) throw new Error("Run with npm run package:azure");
const destination = resetGeneratedDirectory(".azure-package");
for (const file of ["host.json", "package-lock.json"]) copyFileSync(join(root, file), join(destination, file));
cpSync(join(root, "dist"), join(destination, "dist"), { recursive: true });
const { name, version, main, dependencies } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
// No development scripts, credentials, raw data, Python, tests or source tree.
writeFileSync(join(destination, "package.json"), JSON.stringify({ name, version, private: true, main, dependencies }, null, 2) + "\n");
const installed = spawnSync(process.execPath, [process.env.npm_execpath, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
  { cwd: destination, stdio: "inherit" });
if (installed.status !== 0) throw new Error("Production dependency installation failed; staging is not publishable");
const tree = spawnSync(process.execPath, [process.env.npm_execpath, "ls", "--omit=dev", "--depth=0"],
  { cwd: destination, stdio: "inherit" });
if (tree.status !== 0) throw new Error("Production dependency validation failed");
const standalone = mkdtempSync(join(tmpdir(), "mars-functions-package-smoke-"));
try {
  cpSync(destination, standalone, { recursive: true });
  const smoke = spawnSync(process.execPath, [join(__dirname, "smoke-azure-package.cjs"), standalone],
    { cwd: standalone, stdio: "inherit", env: { ...process.env, NODE_PATH: "" } });
  if (smoke.status !== 0) throw new Error("Standalone production package failed validation");
} finally {
  // This absolute target was freshly created by mkdtemp; never a repository/input path.
  rmSync(standalone, { recursive: true, force: true });
}
console.log(`Production-only Functions package staged at ${destination}; not deployed.`);
