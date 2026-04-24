import { clearSession } from "@/lib/auth";
import { handle, json } from "@/lib/http";

export async function POST() {
  return handle(async () => {
    await clearSession();
    return json({ ok: true });
  });
}
