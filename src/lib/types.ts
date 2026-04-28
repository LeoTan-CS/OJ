export type SessionUser = {
  id: string;
  username: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
};
