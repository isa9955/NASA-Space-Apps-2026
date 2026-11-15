export type ScreenPath = "welcome" | "overview" | "explorer" | "not-found";

export function resolveScreenPath(pathname: string): ScreenPath {
  if (pathname === "/overview") return "overview";
  if (pathname === "/explorer") return "explorer";
  if (pathname === "/") return "welcome";
  return "not-found";
}
