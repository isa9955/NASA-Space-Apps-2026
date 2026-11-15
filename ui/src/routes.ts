export type ScreenPath = "welcome" | "overview" | "explorer";

export function resolveScreenPath(pathname: string): ScreenPath {
  if (pathname === "/overview") return "overview";
  if (pathname === "/explorer") return "explorer";
  return "welcome";
}
