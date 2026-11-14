export async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      "The API returned no JSON. Check that Azure Functions is running, then retry.",
    );
  }
  if (!response.ok)
    throw new Error(body.error?.message || `API error ${response.status}`);
  if (body.schemaVersion !== "2.0.0")
    throw new Error("Unsupported API schema; rebuild the backend and refresh.");
  return body as T;
}
export const format = (value: number | null | undefined, digits = 1) =>
  value == null ? "Unknown" : value.toFixed(digits);
