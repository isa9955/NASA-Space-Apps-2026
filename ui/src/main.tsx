import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { resolveScreenPath } from "./routes";

// Native routes preserve refresh, browser history and open-in-new-tab behavior.
// Load each screen separately so the landing does not load the scientific explorer.
async function bootstrap() {
  const screen = resolveScreenPath(window.location.pathname);
  const { default: Screen } = screen === "welcome"
    ? await import("./landing/EditorialLanding")
    : screen === "overview"
      ? await import("./explorer/Globe").then(({ Globe }) => ({ default: Globe }))
      : screen === "explorer"
        ? await import("./App")
        : await import("./NotFound");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Screen />
    </StrictMode>
  );
}

void bootstrap();
