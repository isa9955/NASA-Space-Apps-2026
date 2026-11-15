import { lazy, Suspense, useState } from "react";
import "./explorer/globe.css";
import { Explorer } from "./explorer/Explorer";
const Globe = lazy(() =>
  import("./explorer/Globe").then((module) => ({ default: module.Globe })),
);
export default function App() {
  const [overview, setOverview] = useState(false);
  return overview ? (
    <Suspense
      fallback={<div className="loading-cover">Loading Mars overview…</div>}
    >
      <Globe onEnter={() => setOverview(false)} />
    </Suspense>
  ) : (
    <>
      <Explorer />
      <button className="return-globe" onClick={() => setOverview(true)}>
        ← Mars overview
      </button>
    </>
  );
}
