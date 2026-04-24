import bcrypt from "bcryptjs";
import { createSession } from "@/lib/auth";
import { handle, json, parseJson, error } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJson(request, loginSchema);
    const user = await prisma.user.findUnique({ where: { username: body.username } });
    if (!user || !user.enabled || !(await bcrypt.compare(body.password, user.passwordHash))) return error("Invalid credentials", 401);
    await createSession(user.id);
    return json({ ok: true, role: user.role });
  });
}
