import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./prisma";
import type { SessionUser } from "./types";

const roles = ["SUPER_ADMIN", "ADMIN", "USER"] as const;
function toRole(value: string): SessionUser["role"] {
  return roles.includes(value as SessionUser["role"]) ? (value as SessionUser["role"]) : "USER";
}

const cookieName = "bench_oj_session";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

export async function createSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(cookieName);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = typeof payload.userId === "string" ? payload.userId : null;
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { group: true } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      role: toRole(user.role),
      groupId: user.groupId,
      groupName: user.group?.name ?? null,
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Response("Unauthorized", { status: 401 });
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role === "USER") throw new Response("Forbidden", { status: 403 });
  return user;
}

export function getRoleHomePath(role: SessionUser["role"] | string) {
  return role === "SUPER_ADMIN" || role === "ADMIN" ? "/admin" : "/dashboard";
}

export function canManageRole(actorRole: SessionUser["role"], targetRole: SessionUser["role"]) {
  if (actorRole === "SUPER_ADMIN") return true;
  return targetRole === "USER";
}
