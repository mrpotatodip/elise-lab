const ADMIN_ROLES = new Set(["tenant_admin", "workspace_admin"]);

export const canResetTwoFactor = (actorRole: string, targetRole: string, isSelf: boolean): boolean => {
  if (isSelf) return false;
  if (actorRole === "tenant_admin") return true;
  if (actorRole === "workspace_admin") return !ADMIN_ROLES.has(targetRole);
  return false;
};
