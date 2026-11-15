import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ConditionValues } from "./ConditionValues";
import type { ConditionsResponse } from "../api/schema";
describe("backend condition display", () => {
  it("renders loading and failed requests without accessing missing measurements", () => {
    expect(
      renderToStaticMarkup(<ConditionValues state={{ status: "loading" }} />),
    ).toContain("Loading point");
    expect(
      renderToStaticMarkup(
        <ConditionValues
          state={{ status: "error", message: "API unavailable" }}
        />,
      ),
    ).toContain("API unavailable");
  });
  it("preserves unknown values, units and modeled qualifiers", () => {
    const missing = { value: null, unit: "m", qualifier: null };
    const data = {
      elevation: { value: -2211, unit: "m", qualifier: null },
      slope: {
        value: 8.1,
        unit: "deg",
        qualifier: "estimated",
        uncertainty: 11.8,
      },
      ice: { value: 454, unit: "m", qualifier: "estimated", kind: "distance" },
      soil: { value: null, qualifier: null },
      radiation: missing,
      temperature: missing,
    } as ConditionsResponse;
    const html = renderToStaticMarkup(
      <ConditionValues state={{ status: "ok", data }} />,
    );
    expect(html).toContain("-2,211 m");
    expect(html).toContain("8.1 ± 11.8 deg (estimated)");
    expect(html.match(/Unknown/g)).toHaveLength(3);
  });
});
