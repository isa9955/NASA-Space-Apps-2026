const { realpathSync, existsSync, lstatSync, rmSync, mkdirSync } = require("node:fs");
const { resolve, join } = require("node:path");
const root = realpathSync(resolve(__dirname, ".."));

function resetGeneratedDirectory(name) {
  if (!["dist", ".azure-package"].includes(name)) throw new Error("Not an approved generated directory");
  const target = join(root, name);
  if (existsSync(target) && lstatSync(target).isSymbolicLink())
    throw new Error("Refusing to clean a linked output directory");
  // The only recursive targets are named generated children of this API root.
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  return target;
}

module.exports = { root, resetGeneratedDirectory };
if (require.main === module) resetGeneratedDirectory(process.argv[2]);
