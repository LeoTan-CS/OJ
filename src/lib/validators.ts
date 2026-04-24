import { z } from "zod";

export const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
export const passwordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(6) });
export const userSchema = z.object({
  username: z.string().min(2),
  password: z.string().min(6).optional(),
  nickname: z.string().min(1),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "USER"]),
  enabled: z.boolean().default(true),
  classId: z.string().nullable().optional(),
});
export const classSchema = z.object({ name: z.string().min(1), description: z.string().default(""), enabled: z.boolean().default(true) });
export const testcaseSchema = z.object({ id: z.string().optional(), args: z.string().min(1), expected: z.string().min(1), isSample: z.boolean().default(false), sortOrder: z.number().int().default(0) });
export const problemSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  functionName: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
  functionSig: z.string().min(1),
  codeTemplate: z.string().min(1),
  difficulty: z.string().default("Easy"),
  timeLimitMs: z.number().int().min(100).max(10000).default(2000),
  enabled: z.boolean().default(true),
  testCases: z.array(testcaseSchema).min(1),
});
export const assignmentSchema = z.object({ classIds: z.array(z.string()) });
export const announcementSchema = z.object({ title: z.string().min(1), body: z.string().min(1), classId: z.string().nullable().optional() });
export const submitSchema = z.object({ code: z.string().min(1).max(20000) });
