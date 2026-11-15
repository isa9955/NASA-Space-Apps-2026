import type { ConditionsResponse } from "../api/schema";
import type { Loadable } from "../panels/loadable";
export function ConditionValues({
  state,
}: {
  state: Loadable<ConditionsResponse> | null;
}) {
  if (!state || state.status === "loading")
    return <p role="status">Loading point conditions…</p>;
  if (state.status === "error") return <p role="alert">{state.message}</p>;
  const c = state.data;
  const number = (v: {
    value: number | null;
    unit: string;
    qualifier: string | null;
    uncertainty?: number | null;
  }) =>
    v.value == null
      ? "Unknown"
      : `${v.value.toLocaleString("en-US", { maximumFractionDigits: 1 })}${v.uncertainty == null ? "" : ` ± ${v.uncertainty.toFixed(1)}`} ${v.unit}${v.qualifier ? ` (${v.qualifier})` : ""}`;
  const values = [
    ["Elevation", number(c.elevation)],
    ["Slope ± uncertainty", number(c.slope)],
    ["To draft landform", number(c.ice)],
    ["Soil", c.soil.value || "Unknown"],
    ["Radiation", number(c.radiation)],
    ["Mean temperature", number(c.temperature)],
  ];
  return (
    <div className="conditions-grid">
      {values.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
