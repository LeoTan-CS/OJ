export const publicUserSelect = {
  id: true,
  username: true,
  nickname: true,
  role: true,
  groupId: true,
  enabled: true,
  createdAt: true,
} as const;

export const publicUserWithGroupSelect = {
  ...publicUserSelect,
  group: true,
} as const;
