// src/pages/Admin/adminKeys.js

// Firestore
export const ADMINS_COLLECTION = "admins"; // docs: { uid } -> { active: true, role?: "ADMIN" | "OWNER" }

export const ADMIN_ROLE = Object.freeze({
  ADMIN: "ADMIN",
  OWNER: "OWNER",
});

export function normalizeAdminRole(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();

  return normalized === ADMIN_ROLE.OWNER
    ? ADMIN_ROLE.OWNER
    : ADMIN_ROLE.ADMIN;
}
export const USERS_COLLECTION = "users";  // docs: { uid } -> perfil do usuário (plano, vipUntil etc.)