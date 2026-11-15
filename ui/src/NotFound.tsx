import { useEffect } from "react";
import "./not-found.css";

export default function NotFound() {
  useEffect(() => {
    document.title = "Page not found — Conquering Mars";
  }, []);

  return (
    <main className="not-found">
      <p className="not-found-code">404</p>
      <h1>Page not found</h1>
      <p className="not-found-copy">That route is outside this Mars exploration mission.</p>
      <nav aria-label="Mars exploration pages">
        <a href="/">Return to welcome</a>
        <a href="/overview">View the whole-Mars overview</a>
      </nav>
    </main>
  );
}
