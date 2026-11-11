import type { ZodType } from "zod";
import { ApiErrorBody } from "../domain";

/** The header the mock reads to know who is signed in. The real backend will use a token instead. */
export const USER_HEADER = "x-ember-user";

export type ApiConfig = {
  /** Where the API lives. "/api" in the browser; an absolute URL in tests. */
  baseUrl: string;
  /** The signed-in user's id. */
  getUserId: () => string;
};

let config: ApiConfig = { baseUrl: "/api", getUserId: () => "sam" };

export function configureApi(next: Partial<ApiConfig>): void {
  config = { ...config, ...next };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options<T> = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  /** Parses the response. The schemas are the contract, so a response that doesn't match is an error. */
  schema: ZodType<T>;
};

export async function request<T>(path: string, options: Options<T>): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  }
  const url = `${config.baseUrl}${path}${params.size ? `?${params}` : ""}`;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      [USER_HEADER]: config.getUserId(),
      ...(options.body !== undefined && { "content-type": "application/json" }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ApiErrorBody.safeParse(data);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "unknown",
      parsed.success ? parsed.data.error.message : "Something went wrong. Try again.",
    );
  }
  return options.schema.parse(data);
}
