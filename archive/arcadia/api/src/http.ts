import type { HttpResponseInit } from "@azure/functions";
import { API_SCHEMA_VERSION, type ErrorResponse } from "./contracts/site.js";

export function json(status: number, body: unknown): HttpResponseInit {
  return { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, jsonBody: body };
}

export function error(status: number, code: ErrorResponse["error"]["code"], message: string): HttpResponseInit {
  const body: ErrorResponse = { schemaVersion: API_SCHEMA_VERSION, error: { code, message } };
  return json(status, body);
}
