import { http, HttpResponse, type HttpHandler } from "msw";
import { ZodError, type ZodType } from "zod";
import type { Role } from "../../domain";
import { db, type Row } from "../db";
import { latency } from "../latency";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type UserRow = Row<"user">;

type Context<Body> = {
  user: UserRow;
  params: Record<string, string>;
  query: URLSearchParams;
  body: Body;
};

type RouteOptions<Body> = {
  /** Roles allowed to call this. Everyone when left out. */
  roles?: readonly Role[];
  /** Validates the JSON body. */
  body?: ZodType<Body>;
  run: (context: Context<Body>) => unknown;
};

/** The header the client sends so the mock knows who is signed in. */
export const USER_HEADER = "x-ember-user";

function currentUser(request: Request): UserRow {
  const id = request.headers.get(USER_HEADER) ?? "sam";
  const user = db.user.findFirst({ where: { id: { equals: id } } });
  if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  return user;
}

/** One handler: latency, who is calling, role check, body validation, and uniform errors. */
export function route<Body = undefined>(
  method: "get" | "post" | "patch" | "delete",
  path: string,
  options: RouteOptions<Body>,
): HttpHandler {
  return http[method](`*/api${path}`, async ({ request, params }) => {
    await latency();
    try {
      const user = currentUser(request);
      if (options.roles && !options.roles.includes(user.role as Role)) {
        throw new ApiError(403, "forbidden", "Your role can't do this.");
      }
      let body = undefined as Body;
      if (options.body) {
        const raw: unknown = await request.json().catch(() => ({}));
        body = options.body.parse(raw);
      }
      const flat: Record<string, string> = {};
      for (const [key, value] of Object.entries(params)) {
        flat[key] = Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
      }
      const data = await options.run({
        user,
        params: flat,
        query: new URL(request.url).searchParams,
        body,
      });
      return HttpResponse.json((data ?? { ok: true }) as never);
    } catch (error) {
      if (error instanceof ApiError) {
        return HttpResponse.json(
          { error: { code: error.code, message: error.message } },
          { status: error.status },
        );
      }
      if (error instanceof ZodError) {
        return HttpResponse.json(
          { error: { code: "invalid_request", message: "The request wasn't valid." } },
          { status: 400 },
        );
      }
      throw error;
    }
  });
}

export function notFound(what: string): never {
  throw new ApiError(404, "not_found", `${what} wasn't found.`);
}

export const STAGE_LABEL: Record<string, string> = {
  discovery: "Discovery",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Closed won",
  lost: "Closed lost",
};
