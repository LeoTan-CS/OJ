import { z } from "zod";

const usernameSchema = z.string().trim().min(2).regex(/^[A-Za-z0-9_.-]+$/, "账号只能包含字母、数字、下划线、点和连字符");

export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(4) });
export const userSchema = z.object({
  username: usernameSchema,
  password: z.string().min(4).optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]),
});
export const announcementSchema = z.object({ title: z.string().min(1), body: z.string().min(1) });
