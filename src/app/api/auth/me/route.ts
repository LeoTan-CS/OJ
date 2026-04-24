import { getCurrentUser } from "@/lib/auth";
import { handle, json, error } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return error("Unauthorized", 401);
    return json({ user });
  });
}
