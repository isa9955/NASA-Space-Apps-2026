import { describe, expect, it } from "vitest";
import { resolveScreenPath } from "./routes";

describe("resolveScreenPath", () => {
  it("maps the three journey URLs to their own screens", () => {
    expect(resolveScreenPath("/")).toBe("welcome");
    expect(resolveScreenPath("/overview")).toBe("overview");
    expect(resolveScreenPath("/explorer")).toBe("explorer");
  });

  it("returns the not-found screen for an unknown path", () => {
    expect(resolveScreenPath("/unknown")).toBe("not-found");
  });
});
