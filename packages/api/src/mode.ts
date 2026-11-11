export const API_MODES = ["mock", "live"] as const;
export type ApiMode = (typeof API_MODES)[number];

/** Reads NEXT_PUBLIC_API_MODE. Anything other than "live" means mock, so a missing value never hits a real server. */
export function getApiMode(): ApiMode {
  return process.env["NEXT_PUBLIC_API_MODE"] === "live" ? "live" : "mock";
}

/** Live mode talks to NEXT_PUBLIC_API_URL. Mock mode uses same-origin /api, which the mock worker answers. */
export function getApiBaseUrl(): string {
  return getApiMode() === "live" ? (process.env["NEXT_PUBLIC_API_URL"] ?? "/api") : "/api";
}
