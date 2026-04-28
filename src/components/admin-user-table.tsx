"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type KeyboardEvent } from "react";
import { DeleteButton } from "./admin-forms";

type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

export type AdminUserTableUser = {
  id: string;
  username: string;
  role: Role;
  groupId: string | null;
  groupName: string | null;
  createdAtLabel: string;
};

export type AdminUserTableGroup = {
  label: string;
  value: string;
};

type RowState = AdminUserTableUser & {
  draftUsername: string;
  error: string;
  message: string;
  pending: boolean;
  resetPending: boolean;
};

function toRowState(user: AdminUserTableUser): RowState {
  return {
    ...user,
    draftUsername: user.username,
    error: "",
    message: "",
    pending: false,
    resetPending: false,
  };
}

function canManageRole(actorRole: Role, targetRole: Role) {
  return actorRole === "SUPER_ADMIN" || targetRole === "USER";
}

function parseRole(value: string): Role {
  return value === "SUPER_ADMIN" || value === "ADMIN" ? value : "USER";
}

export function AdminUserTable({
  actorRole,
  groups,
  users,
}: {
  actorRole: "SUPER_ADMIN" | "ADMIN";
  groups: AdminUserTableGroup[];
  users: AdminUserTableUser[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RowState[]>(() => users.map(toRowState));
  const groupNameById = useMemo(() => new Map(groups.map((group) => [group.value, group.label])), [groups]);
  const roleOptions: Role[] = actorRole === "SUPER_ADMIN" ? ["USER", "ADMIN", "SUPER_ADMIN"] : ["USER"];

  function groupNameFor(role: Role, groupId: string | null) {
    if (role !== "USER" || !groupId) return null;
    return groupNameById.get(groupId) ?? null;
  }

  function updateRow(id: string, update: (row: RowState) => RowState) {
    setRows((current) => current.map((row) => row.id === id ? update(row) : row));
  }

  async function saveRow(id: string, changes: Partial<Pick<AdminUserTableUser, "groupId" | "role" | "username">>) {
    const current = rows.find((row) => row.id === id);
    if (!current || current.pending || current.resetPending || !canManageRole(actorRole, current.role)) return;

    const nextRole = changes.role ?? current.role;
    const nextGroupId = nextRole === "USER" ? changes.groupId ?? current.groupId : null;
    const nextUsername = changes.username ?? current.username;

    if (nextUsername === current.username && nextRole === current.role && nextGroupId === current.groupId) {
      updateRow(id, (row) => ({ ...row, draftUsername: row.username, error: "" }));
      return;
    }

    const previous = current;
    updateRow(id, (row) => ({
      ...row,
      username: nextUsername,
      draftUsername: nextUsername,
      role: nextRole,
      groupId: nextGroupId,
      groupName: groupNameFor(nextRole, nextGroupId),
      error: "",
      message: "",
      pending: true,
    }));

    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: nextUsername,
        role: nextRole,
        groupId: nextGroupId ?? "",
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = typeof data.error === "string" ? data.error : "保存失败";
      updateRow(id, () => ({ ...previous, draftUsername: previous.username, error: message, pending: false }));
      return;
    }

    const user = data.user as Partial<AdminUserTableUser> & { group?: { name?: string | null } | null };
    const savedRole = parseRole(String(user.role ?? nextRole));
    const savedGroupId = typeof user.groupId === "string" ? user.groupId : null;
    const savedUsername = String(user.username ?? nextUsername);
    updateRow(id, (row) => ({
      ...row,
      username: savedUsername,
      draftUsername: savedUsername,
      role: savedRole,
      groupId: savedGroupId,
      groupName: user.group?.name ?? groupNameFor(savedRole, savedGroupId),
      error: "",
      message: "",
      pending: false,
    }));
    router.refresh();
  }

  async function resetPassword(id: string) {
    const current = rows.find((row) => row.id === id);
    if (!current || current.pending || current.resetPending || !canManageRole(actorRole, current.role)) return;
    if (!confirm(`确定将 ${current.username} 的密码重置为用户名？`)) return;

    updateRow(id, (row) => ({ ...row, error: "", message: "", resetPending: true }));
    const response = await fetch(`/api/admin/users/${id}/reset-password`, { method: "POST" });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      updateRow(id, (row) => ({
        ...row,
        error: typeof data.error === "string" ? data.error : "重置失败",
        resetPending: false,
      }));
      return;
    }

    updateRow(id, (row) => ({ ...row, message: "密码已重置为用户名", resetPending: false }));
  }

  function commitUsername(id: string) {
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    void saveRow(id, { username: row.draftUsername.trim() });
  }

  function resetUsername(id: string) {
    updateRow(id, (row) => ({ ...row, draftUsername: row.username, error: "" }));
  }

  function handleUsernameKeyDown(id: string, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      resetUsername(id);
    }
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="min-w-[760px]">
        <thead>
          <tr>
            <th>用户名</th>
            <th>角色</th>
            <th>组别标记</th>
            <th>创建时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const manageable = canManageRole(actorRole, row.role);
            const controlsDisabled = !manageable || row.pending || row.resetPending;
            const resetDisabled = controlsDisabled || row.draftUsername.trim() !== row.username;
            const groupDisabled = controlsDisabled || row.role !== "USER";
            const rowRoleOptions = roleOptions.includes(row.role) ? roleOptions : [row.role, ...roleOptions];
            return (
              <tr key={row.id}>
                <td className="min-w-44">
                  <input
                    className="font-semibold text-slate-950 disabled:bg-slate-100 disabled:text-slate-500"
                    disabled={controlsDisabled}
                    value={row.draftUsername}
                    onBlur={() => commitUsername(row.id)}
                    onChange={(event) => updateRow(row.id, (current) => ({ ...current, draftUsername: event.target.value, error: "", message: "" }))}
                    onKeyDown={(event) => handleUsernameKeyDown(row.id, event)}
                  />
                </td>
                <td className="min-w-36">
                  <select
                    disabled={controlsDisabled}
                    value={row.role}
                    onChange={(event) => void saveRow(row.id, { role: parseRole(event.target.value) })}
                  >
                    {rowRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td className="min-w-40">
                  <select
                    disabled={groupDisabled}
                    value={row.groupId ?? ""}
                    onChange={(event) => void saveRow(row.id, { groupId: event.target.value || null })}
                  >
                    {groups.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                  </select>
                </td>
                <td>{row.createdAtLabel}</td>
                <td className="min-w-32">
                  <div className="grid gap-1">
                    {row.pending && <span className="text-xs font-medium text-slate-500">保存中...</span>}
                    {row.resetPending && <span className="text-xs font-medium text-slate-500">重置中...</span>}
                    {row.message && <span className="text-xs font-medium text-emerald-700">{row.message}</span>}
                    {row.error && <span className="text-xs font-medium text-red-600">{row.error}</span>}
                    {manageable ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void resetPassword(row.id)}
                          disabled={resetDisabled}
                          className="text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:text-slate-400"
                        >
                          重置密码
                        </button>
                        <DeleteButton endpoint={`/api/admin/users/${row.id}`} />
                      </div>
                    ) : <span className="text-xs font-medium text-slate-400">无权限</span>}
                  </div>
                </td>
              </tr>
            );
          })}
          {!rows.length && (
            <tr>
              <td colSpan={5} className="text-sm text-slate-500">暂无用户。</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
