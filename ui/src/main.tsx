import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";

// Native links preserve refresh, browser history and open-in-new-tab behavior.
// Keep the map and landing bundles separate; neither screen mounts the other.
async function bootstrap() {
  const { default: Screen } = window.location.pathname === "/"
    ? await import("./landing/EditorialLanding")
    : await import("./App");

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Screen />
    </StrictMode>
  );
}

void bootstrap();
