export type SessionUser = {
  id: string;
  username: string;
  role: "SUPER_ADMIN" | "ADMIN" | "USER";
  groupId: string | null;
  groupName: string | null;
};
