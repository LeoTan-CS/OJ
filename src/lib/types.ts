export type SessionUser = {
  id: string;
  username: string;
  nickname: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  classId: string | null;
};
