import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ValidateFunction } from "ajv";

/** Transport validation only. Scientific consistency checks stay in each reader. */
export function readValidatedArtifact<T>(path: string, validate: ValidateFunction<T>, label: string): T {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!validate(parsed)) throw new Error(`Invalid ${label} artifact: ${JSON.stringify(validate.errors)}`);
  return parsed;
}

export const packagedPath = (filename: string): string => join(__dirname, "../data", filename);

/** Cache only successful loads. Failures remain retryable and never select fixtures. */
export function packagedArtifact<T extends object>(filename: string, read: (path: string) => T): () => T {
  let cached: T | undefined;
  return () => (cached ??= read(packagedPath(filename)));
}
