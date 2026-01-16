// src/pages/Dashboard/components/Sidebar/AppShell.jsx
import React, { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import MiniLogo from "./MiniLogo";

import { auth } from "../../../../services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";

const ROUTES = {
  DASHBOARD: "dashboard",
  ACCOUNT: "account",
  RESULTS: "results",
  TOP3: "top3",
  LATE: "late",
  SEARCH: "search",
  PAYMENTS: "payments",
  DOWNLOADS: "downloads",
  CENTENAS: "centenas",
};

const ACCOUNT_SESSION_KEY = "pp_session_v1";
const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

/* ======================
   Helpers seguros
====================== */
const safeReadLS = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const safeWriteLS = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
const safeRemoveLS = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {}
};

function readSession() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) return { ok: false };

  try {
    const obj = JSON.parse(raw);
    return { ok: true, ...obj };
  } catch {
    return { ok: true, type: "user", plan: "FREE" };
  }
}

function useViewport() {
  const [vw, setVw] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  return vw;
}

export default function AppShell({ active, onNavigate, onLogout, children }) {
  const [session, setSession] = useState(() => readSession());
  const vw = useViewport();

  /* ======================
     Sync Firebase Auth
  ====================== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        safeWriteLS(
          ACCOUNT_SESSION_KEY,
          JSON.stringify({ type: "user", plan: "FREE", uid: user.uid })
        );
        setSession(readSession());
        return;
      }

      if (safeReadLS(LS_GUEST_ACTIVE_KEY) === "1") {
        safeWriteLS(
          ACCOUNT_SESSION_KEY,
          JSON.stringify({ type: "guest", plan: "FREE" })
        );
        setSession(readSession());
      }
    });

    return () => unsub();
  }, []);

  const isGuest = session?.type === "guest";
  const isMobile = vw < 980;

  /* ======================
     Navegação
  ====================== */
  const handleNavigate = async (key) => {
    if (!key) return;

    if (key === "__LOGOUT__") {
      try {
        await signOut(auth);
      } catch {}

      safeRemoveLS(ACCOUNT_SESSION_KEY);
      safeRemoveLS(LS_GUEST_ACTIVE_KEY);

      onLogout?.();
      return;
    }

    onNavigate?.(key);
  };

  /* ======================
     UI (premium lateral + anti-corte)
  ====================== */

  const UI = useMemo(() => {
    const GOLD = "rgba(202,166,75,1)";
    const GOLD_SOFT = "rgba(202,166,75,0.18)";
    const WHITE = "rgba(255,255,255,0.92)";
    const BORDER = "rgba(255,255,255,0.10)";
    const BG = "#050505";

    const sidebarW = isMobile ? 74 : 92; // desktop mais “premium”
    return {
      shell: {
        minHeight: "100vh",
        height: "100dvh", // melhora em mobile modernos
        background: BG,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden", // importante (main rola, não o body)
      },
      sidebar: {
        width: sidebarW,
        minWidth: sidebarW,
        height: "100%",
        borderRight: `1px solid ${BORDER}`,
        background:
          "radial-gradient(120px 220px at 40% 10%, rgba(202,166,75,0.10), rgba(0,0,0,0)), rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "12px 10px",
        boxSizing: "border-box",
      },
      brand: {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        paddingBottom: 10,
        borderBottom: `1px solid ${BORDER}`,
      },
      plan: {
        fontSize: 11,
        fontWeight: 900,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${GOLD_SOFT}`,
        color: GOLD,
        background: "rgba(0,0,0,0.35)",
        letterSpacing: 0.2,
      },
      nav: {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 10,
        alignItems: "center",
        overflow: "auto",
      },
      btn: (isActive) => ({
        width: "100%",
        height: 44,
        borderRadius: 14,
        border: `1px solid ${isActive ? "rgba(202,166,75,0.55)" : BORDER}`,
        background: isActive
          ? "linear-gradient(180deg, rgba(202,166,75,0.16), rgba(0,0,0,0.35))"
          : "rgba(0,0,0,0.25)",
        color: WHITE,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        boxShadow: isActive ? "0 14px 36px rgba(0,0,0,0.55)" : "none",
      }),
      main: {
        flex: 1,
        minWidth: 0,
        height: "100%",
        overflow: "auto", // ✅ isso evita corte
        WebkitOverflowScrolling: "touch",
      },
    };
  }, [isMobile]);

  // ✅ MENU: adicionamos Downloads
  // Se quiser esconder no guest, é só filtrar: .filter(x => !isGuest || x.key !== ROUTES.DOWNLOADS)
  const menu = [
    { key: ROUTES.DASHBOARD, icon: "home", title: "Dashboard" },
    { key: ROUTES.RESULTS, icon: "calendar", title: "Resultados" },
    { key: ROUTES.TOP3, icon: "trophy", title: "Top 3" },
    { key: ROUTES.LATE, icon: "clock", title: "Atrasados" },
    { key: ROUTES.SEARCH, icon: "search", title: "Busca" },
    { key: ROUTES.CENTENAS, icon: "hash", title: "Centenas" },

    // ✅ NOVO: Downloads (PDF / Excel)
    { key: ROUTES.DOWNLOADS, icon: "download", title: "Downloads" },

    { key: ROUTES.ACCOUNT, icon: "user", title: "Minha Conta" },
  ];

  return (
    <div style={UI.shell}>
      <aside style={UI.sidebar}>
        <div style={UI.brand}>
          <MiniLogo />
          <div style={UI.plan}>{isGuest ? "PREVIEW" : "FREE"}</div>
        </div>

        <nav style={UI.nav}>
          {menu.map((m) => (
            <button
              key={m.key}
              onClick={() => handleNavigate(m.key)}
              title={m.title}
              style={UI.btn(active === m.key)}
            >
              <Icon name={m.icon} />
            </button>
          ))}

          <button
            onClick={() => handleNavigate("__LOGOUT__")}
            title={isGuest ? "Sair do Preview" : "Sair"}
            style={UI.btn(false)}
          >
            <Icon name="logout" />
          </button>
        </nav>
      </aside>

      <main style={UI.main}>{children}</main>
    </div>
  );
}
