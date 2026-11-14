import type { RegionResponse } from "../api/schema";

export function Header({ region }: { region: RegionResponse | null }) {
  return (
    <header className="header">
      <span className="logo" aria-hidden />
      <span className="brand">
        MARS <span className="brand-accent">SITE PLANNER</span>
      </span>
      {region && (
        <>
          <span className="divider" aria-hidden />
          <span className="subtitle">
            {region.region.subtitle} · {region.region.name}
          </span>
          <span className={`data-badge ${region.dataBadge.kind}`}>{region.dataBadge.label}</span>
        </>
      )}
    </header>
  );
}
