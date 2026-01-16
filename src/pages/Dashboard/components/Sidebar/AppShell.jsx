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

/**
 * Viewport robusto (resize + orientationchange)
 */
function useViewport() {
  const [vw, setVw] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    window.addEventListener("resize", onR);
    window.addEventListener("orientationchange", onR);
    return () => {
      window.removeEventListener("resize", onR);
      window.removeEventListener("orientationchange", onR);
    };
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

  // Breakpoints
  const isNarrow = vw < 1100; // reduz um pouco o rail antes
  const isMobile = vw < 860;  // rail compacto

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
    const WHITE = "rgba(255,255,255,0.92)";
    const BORDER = "rgba(255,255,255,0.10)";
    const BG = "#050505";

    // Sidebar mais elegante no desktop, rail compacto no mobile
    const sidebarW = isMobile ? 72 : isNarrow ? 84 : 96;

    return {
      shell: {
        minHeight: "100vh",
        // evita alguns bugs de 100dvh em desktop/zoom:
        height: "100vh",
        background: BG,
        display: "flex",
        flexDirection: "row",

        // ✅ MUITO importante: o body não deve rolar
        overflow: "hidden",

        // segurança contra páginas que “estouram” width:
        width: "100%",
      },

      sidebar: {
        width: sidebarW,
        minWidth: sidebarW,
        height: "100%",
        borderRight: `1px solid ${BORDER}`,
        background:
          "radial-gradient(140px 260px at 50% 10%, rgba(202,166,75,0.12), rgba(0,0,0,0)), rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: "12px 10px",
        boxSizing: "border-box",

        // ✅ premium: fixa e estável
        position: "sticky",
        top: 0,
        left: 0,

        // rail não deve criar scroll horizontal
        overflow: "hidden",
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
        border: `1px solid rgba(202,166,75,0.22)`,
        color: GOLD,
        background: "rgba(0,0,0,0.35)",
        letterSpacing: 0.2,
        userSelect: "none",
      },

      nav: {
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        paddingTop: 10,
        alignItems: "center",

        // ✅ o nav pode rolar, mas sem quebrar layout
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",

        // “borda invisível” pra não colar
        paddingBottom: 10,
      },

      btn: (isActive) => ({
        width: "100%",
        height: 44,
        borderRadius: 14,
        border: `1px solid ${
          isActive ? "rgba(202,166,75,0.55)" : BORDER
        }`,
        background: isActive
          ? "linear-gradient(180deg, rgba(202,166,75,0.18), rgba(0,0,0,0.35))"
          : "rgba(0,0,0,0.25)",
        color: WHITE,
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
        boxShadow: isActive ? "0 14px 36px rgba(0,0,0,0.55)" : "none",
        outline: "none",
      }),

      main: {
        flex: 1,
        minWidth: 0,
        height: "100%",

        // ✅ aqui é onde o app rola
        overflowY: "auto",
        overflowX: "hidden",
        WebkitOverflowScrolling: "touch",

        // ✅ anti-corte: contenção e conforto
        boxSizing: "border-box",
        padding: "clamp(10px, 1.2vw, 18px)",

        // ✅ evita “puxar” scroll do body
        overscrollBehavior: "contain",
      },

      // opcional: um container interno pra padronizar largura máxima
      content: {
        width: "100%",
        minWidth: 0,
        maxWidth: 1680,
        margin: "0 auto",
      },
    };
  }, [isMobile, isNarrow]);

  const menu = [
    { key: ROUTES.DASHBOARD, icon: "home", title: "Dashboard" },
    { key: ROUTES.RESULTS, icon: "calendar", title: "Resultados" },
    { key: ROUTES.TOP3, icon: "trophy", title: "Top 3" },
    { key: ROUTES.LATE, icon: "clock", title: "Atrasados" },
    { key: ROUTES.SEARCH, icon: "search", title: "Busca" },
    { key: ROUTES.CENTENAS, icon: "hash", title: "Centenas" },
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

      <main style={UI.main}>
        <div style={UI.content}>{children}</div>
      </main>
    </div>
  );
}
