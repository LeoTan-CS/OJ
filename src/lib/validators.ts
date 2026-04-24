import { z } from "zod";
import { competitionMetrics } from "@/lib/judge";

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
export const competitionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  metric: z.enum(competitionMetrics).default("accuracy"),
  hiddenTestDataDir: z.string().min(1),
  answerCsvPath: z.string().min(1),
  codeTemplate: z.string().default(""),
  runtimeLimitMs: z.number().int().min(1000).max(120000).default(10000),
  enabled: z.boolean().default(true),
});
export const assignmentSchema = z.object({ classIds: z.array(z.string()) });
export const announcementSchema = z.object({ title: z.string().min(1), body: z.string().min(1), classId: z.string().nullable().optional() });
export const submitSchema = z.object({ code: z.string().min(1).max(100000) });
