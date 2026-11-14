import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * /api handling in development:
 *   - API_PROXY_TARGET unset  -> in-process mock backend (src/mocks/server.ts)
 *   - API_PROXY_TARGET=http://localhost:7071 -> forward to the Python Functions host
 * The UI code is identical in both cases: it always fetches /api/*.
 */
function mockApi(): Plugin {
  const middleware: Connect.NextHandleFunction = async (req, res) => {
    const { handleMockRequest } = await import("./src/mocks/server");
    try {
      const r = handleMockRequest(req.originalUrl ?? req.url ?? "/");
      res.statusCode = r.status;
      res.setHeader("Content-Type", r.contentType);
      res.setHeader("Cache-Control", "no-store");
      res.end(typeof r.body === "string" ? r.body : Buffer.from(r.body));
    } catch (e) {
      console.error("[mock api]", e);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: { code: "INTERNAL", message: "Mock backend crashed." } }));
    }
  };
  return {
    name: "mock-api",
    configureServer(server) {
      server.middlewares.use("/api", middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api", middleware);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.API_PROXY_TARGET;
  return {
    plugins: [react(), ...(target ? [] : [mockApi()])],
    server: target ? { proxy: { "/api": target } } : undefined,
    preview: target ? { proxy: { "/api": target } } : undefined
  };
});
