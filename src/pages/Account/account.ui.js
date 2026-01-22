// src/pages/Account/account.ui.js

/**
 * UI tokens e estilos do módulo Account
 * - Sem React
 * - Exporta factory: buildAccountUI({ vw })
 */

export function buildAccountUI({ vw = 1200 } = {}) {
  const gridIsMobile = Number(vw || 0) < 980;

  const GOLD = "rgba(201,168,62,0.95)";
  const BORDER = "rgba(255,255,255,0.14)";
  const BORDER2 = "rgba(255,255,255,0.10)";
  const BG = "rgba(0,0,0,0.40)";
  const BG2 = "rgba(0,0,0,0.45)";
  const SHADOW = "0 18px 48px rgba(0,0,0,0.55)";

  return {
    gridIsMobile,

    page: {
      height: "100%",
      minHeight: 0,
      padding: 18,
      display: "flex",
      flexDirection: "column",
      gap: 14,
      boxSizing: "border-box",
      color: "rgba(255,255,255,0.92)",
    },

    header: {
      padding: "14px 16px",
      borderRadius: 18,
      border: `1px solid ${BORDER}`,
      background: BG2,
      boxShadow: SHADOW,
    },

    title: { fontSize: 18, fontWeight: 900, letterSpacing: 0.2 },

    subtitle: { marginTop: 6, fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

    card: {
      borderRadius: 18,
      border: `1px solid ${BORDER}`,
      background: BG,
      boxShadow: SHADOW,
      padding: 16,
      minWidth: 0,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    },

    cardHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      minWidth: 0,
    },

    cardTitle: { fontSize: 14, fontWeight: 900, letterSpacing: 0.15 },

    badge: {
      fontSize: 11,
      fontWeight: 800,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      whiteSpace: "nowrap",
    },

    avatarRow: {
      display: "grid",
      gridTemplateColumns: gridIsMobile ? "1fr" : "92px 1fr",
      gap: 12,
      alignItems: "center",
    },

    avatar: {
      width: 92,
      height: 92,
      borderRadius: 18,
      border: "1px solid rgba(201,168,62,0.35)",
      background:
        "radial-gradient(70px 70px at 30% 20%, rgba(201,168,62,0.25), rgba(0,0,0,0)), linear-gradient(180deg, rgba(201,168,62,0.10), rgba(0,0,0,0.38))",
      boxShadow: "0 16px 40px rgba(0,0,0,0.60)",
      overflow: "hidden",
      display: "grid",
      placeItems: "center",
    },

    avatarImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },

    avatarFallback: {
      fontWeight: 1000,
      color: "rgba(10,10,10,0.92)",
      background: "rgba(201,168,62,0.95)",
      width: "100%",
      height: "100%",
      display: "grid",
      placeItems: "center",
      fontSize: 22,
      letterSpacing: 0.4,
    },

    hint: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

    input: {
      height: 44,
      borderRadius: 12,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(0,0,0,0.45)",
      color: "rgba(255,255,255,0.92)",
      padding: "0 12px",
      outline: "none",
      boxSizing: "border-box",
      fontWeight: 800,
      letterSpacing: 0.15,
    },

    actions: { marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap" },

    primaryBtn: (disabled) => ({
      height: 40,
      borderRadius: 14,
      border: "1px solid rgba(201,168,62,0.55)",
      background: "rgba(201,168,62,0.14)",
      color: GOLD,
      fontWeight: 950,
      letterSpacing: 0.15,
      cursor: disabled ? "not-allowed" : "pointer",
      padding: "0 14px",
      opacity: disabled ? 0.6 : 1,
    }),

    secondaryBtn: (disabled) => ({
      height: 40,
      borderRadius: 14,
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.06)",
      color: "rgba(255,255,255,0.92)",
      fontWeight: 900,
      letterSpacing: 0.15,
      cursor: disabled ? "not-allowed" : "pointer",
      padding: "0 14px",
      opacity: disabled ? 0.6 : 1,
    }),

    dangerBtn: (disabled) => ({
      height: 40,
      borderRadius: 14,
      border: "1px solid rgba(255,120,120,0.42)",
      background: "rgba(255,120,120,0.10)",
      color: "rgba(255,170,170,0.95)",
      fontWeight: 950,
      letterSpacing: 0.15,
      cursor: disabled ? "not-allowed" : "pointer",
      padding: "0 14px",
      opacity: disabled ? 0.6 : 1,
    }),

    msgErr: { fontSize: 12.5, fontWeight: 900, color: "rgba(255,120,120,0.95)" },

    msgOk: { fontSize: 12.5, fontWeight: 900, color: "rgba(120,255,180,0.95)" },

    divider: { height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" },

    row: {
      display: "grid",
      gridTemplateColumns: gridIsMobile ? "1fr" : "140px 1fr",
      gap: 10,
      alignItems: "center",
      padding: "10px 12px",
      borderRadius: 14,
      border: `1px solid ${BORDER2}`,
      background: "rgba(0,0,0,0.35)",
    },

    k: { fontSize: 12, fontWeight: 900, opacity: 0.75 },

    v: { fontSize: 12.5, fontWeight: 800, wordBreak: "break-word" },
  };
}
