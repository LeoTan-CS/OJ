import { ZodError } from "zod";

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function error(message: string, status = 400) {
  return json({ error: message }, { status });
}

export async function parseJson<T>(request: Request, schema: { parse: (value: unknown) => T }) {
  try {
    return schema.parse(await request.json());
  } catch (err) {
    if (err instanceof ZodError) throw new Response(JSON.stringify({ error: err.issues[0]?.message ?? "Invalid request" }), { status: 400 });
    throw new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }
}

export async function handle(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (err) {
    if (err instanceof Response) return err;
    console.error(err);
    return error("Internal server error", 500);
  }
}
