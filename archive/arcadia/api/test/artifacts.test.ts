import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";
const { readValidatedArtifact, packagedArtifact } = require("../dist/src/artifacts.js");

test("shared artifact reader preserves zero values and rejects missing/malformed/invalid data", () => {
  const dir = mkdtempSync(join(tmpdir(), "artifact-check-"));
  const file = join(dir, "data.json");
  const validate = new Ajv2020().compile({ type: "object", required: ["value"], properties: { value: { type: "number" } } });
  try {
    assert.throws(() => readValidatedArtifact(file, validate, "test"));
    writeFileSync(file, "not json");
    assert.throws(() => readValidatedArtifact(file, validate, "test"));
    writeFileSync(file, '{"value":null}');
    assert.throws(() => readValidatedArtifact(file, validate, "test"), /Invalid test artifact/);
    writeFileSync(file, '{"value":0}');
    assert.deepEqual(readValidatedArtifact(file, validate, "test"), { value: 0 });
  } finally { rmSync(dir, { recursive: true }); }
});

test("packaged loaders retry failures and cache only validated successful loads", () => {
  let attempts = 0;
  const value = { status: "unknown", measurement: null };
  const load = packagedArtifact("test.json", () => {
    if (++attempts === 1) throw new Error("temporarily unavailable");
    return value;
  });
  assert.throws(load, /unavailable/);
  assert.equal(load(), value);
  assert.equal(load(), value);
  assert.equal(attempts, 2);
});
