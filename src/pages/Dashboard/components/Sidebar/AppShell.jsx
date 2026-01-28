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
    // fallback conservador (não quebra UI)
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
  const isMobile = vw < 980;

  // ✅ Mobile: sidebar vira off-canvas (fechada por padrão)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Se virar desktop, mantém aberto; se voltar pro mobile, fecha
  useEffect(() => {
    if (!isMobile) setSidebarOpen(true);
    else setSidebarOpen(false);
  }, [isMobile]);

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

      // sem user -> se guest ativo, mantém preview
      if (safeReadLS(LS_GUEST_ACTIVE_KEY) === "1") {
        safeWriteLS(
          ACCOUNT_SESSION_KEY,
          JSON.stringify({ type: "guest", plan: "FREE" })
        );
        setSession(readSession());
        return;
      }

      // ✅ sem user e sem guest: limpa (evita sessão stale)
      safeRemoveLS(ACCOUNT_SESSION_KEY);
      setSession({ ok: false });
    });

    return () => unsub();
  }, []);

  const isGuest = session?.type === "guest";

  /* ======================
     Mobile UX: trava scroll + ESC fecha
  ====================== */
  useEffect(() => {
    if (!isMobile) return;

    const prevOverflow = document?.body?.style?.overflow;
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = prevOverflow || "";
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow || "";
    };
  }, [isMobile, sidebarOpen]);

  /* ======================
     Navegação
  ====================== */
  const handleNavigate = async (key) => {
    if (!key) return;

    // ✅ fecha menu no mobile após navegar
    if (isMobile) setSidebarOpen(false);

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
     UI (premium + mobile-first)
  ====================== */
  const UI = useMemo(() => {
    const GOLD = "rgba(202,166,75,1)";
    const GOLD_SOFT = "rgba(202,166,75,0.18)";
    const WHITE = "rgba(255,255,255,0.92)";
    const BORDER = "rgba(255,255,255,0.10)";
    const BG = "#050505";

    const sidebarW = isMobile ? 84 : 92;

    const shell = {
      minHeight: "100vh",
      height: "100dvh",
      background: BG,
      position: "relative",
      overflow: "hidden", // main que rola
      display: "flex",
      flexDirection: "row",
    };

    const sidebarBase = {
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
    };

    const sidebar = isMobile
      ? {
          ...sidebarBase,
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 60,
          transform: sidebarOpen ? "translateX(0)" : "translateX(-110%)",
          transition: "transform 220ms ease",
          borderRight: `1px solid ${BORDER}`,
          boxShadow: "18px 0 48px rgba(0,0,0,0.65)",
        }
      : {
          ...sidebarBase,
          position: "relative",
          zIndex: 2,
        };

    const overlay = isMobile
      ? {
          position: "fixed",
          inset: 0,
          zIndex: 50,
          background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
          opacity: sidebarOpen ? 1 : 0,
          pointerEvents: sidebarOpen ? "auto" : "none",
          transition: "opacity 200ms ease",
        }
      : { display: "none" };

    const brand = {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 10,
      paddingBottom: 10,
      borderBottom: `1px solid ${BORDER}`,
    };

    const plan = {
      fontSize: 11,
      fontWeight: 900,
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${GOLD_SOFT}`,
      color: GOLD,
      background: "rgba(0,0,0,0.35)",
      letterSpacing: 0.2,
    };

    const nav = {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      paddingTop: 10,
      alignItems: "center",
      overflow: "auto",
      flex: 1, // ✅ permite scroll sem “empurrar” brand
    };

    const btn = (isActive) => ({
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
    });

    const main = {
      flex: 1,
      minWidth: 0,
      height: "100%",
      overflow: "auto",
      WebkitOverflowScrolling: "touch",
      position: "relative",
      zIndex: 1,
    };

    // ✅ Botão hambúrguer premium no mobile
    const mobileMenuBtn = isMobile
      ? {
          position: "sticky",
          top: 10,
          zIndex: 20,
          margin: "10px 0 0 10px",
          width: 42,
          height: 42,
          borderRadius: 14,
          border: `1px solid ${BORDER}`,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.35))",
          boxShadow: "0 14px 36px rgba(0,0,0,0.55)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }
      : { display: "none" };

    const mainInner = { minWidth: 0 };

    return {
      shell,
      sidebar,
      overlay,
      brand,
      plan,
      nav,
      btn,
      main,
      mobileMenuBtn,
      mainInner,
    };
  }, [isMobile, sidebarOpen]);

  // ✅ MENU
  const menu = [
    { key: ROUTES.DASHBOARD, icon: "home", title: "Dashboard" },
    { key: ROUTES.RESULTS, icon: "calendar", title: "Resultados" },
    { key: ROUTES.TOP3, icon: "trophy", title: "Top 3" },
    { key: ROUTES.LATE, icon: "clock", title: "Atrasados" },
    { key: ROUTES.SEARCH, icon: "search", title: "Busca" },
    { key: ROUTES.CENTENAS, icon: "hash", title: "Centenas" },
    { key: ROUTES.DOWNLOADS, icon: "download", title: "Downloads" },
    { key: ROUTES.ACCOUNT, icon: "user", title: "Minha Conta" },
  ];

  return (
    <div style={UI.shell}>
      {/* ✅ Overlay mobile */}
      <div
        style={UI.overlay}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside style={UI.sidebar} aria-label="Menu lateral">
        <div style={UI.brand}>
          <MiniLogo />
          <div style={UI.plan}>{isGuest ? "PREVIEW" : "FREE"}</div>
        </div>

        <nav style={UI.nav} role="navigation" aria-label="Navegação principal">
          {menu.map((m) => {
            const isActive = active === m.key;
            return (
              <button
                key={m.key}
                onClick={() => handleNavigate(m.key)}
                title={m.title}
                style={UI.btn(isActive)}
                aria-current={isActive ? "page" : undefined}
                aria-label={m.title}
                type="button"
              >
                <Icon name={m.icon} />
              </button>
            );
          })}

          <button
            onClick={() => handleNavigate("__LOGOUT__")}
            title={isGuest ? "Sair do Preview" : "Sair"}
            style={UI.btn(false)}
            aria-label={isGuest ? "Sair do Preview" : "Sair"}
            type="button"
          >
            <Icon name="logout" />
          </button>
        </nav>
      </aside>

      <main style={UI.main}>
        {/* ✅ Botão menu (aparece só no mobile) */}
        <button
          type="button"
          style={UI.mobileMenuBtn}
          onClick={() => setSidebarOpen(true)}
          title="Menu"
          aria-label="Abrir menu"
        >
          <Icon name="menu" />
        </button>

        <div style={UI.mainInner}>{children}</div>
      </main>
    </div>
  );
}
