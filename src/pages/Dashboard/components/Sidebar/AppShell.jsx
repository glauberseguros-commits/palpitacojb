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

const safeReadLS = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

const safeRemoveLS = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {}
};

function normalizePlan(plan) {
  const p = String(plan || "").trim().toUpperCase();
  if (p === "VIP") return "VIP";
  if (p === "PREMIUM") return "PREMIUM";
  if (p === "FREE") return "FREE";
  return "";
}

function readSession() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) {
    return {
      ok: false,
      type: "anon",
      plan: "",
      uid: "",
      email: "",
      raw: null,
    };
  }

  try {
    const obj = JSON.parse(raw);
    const type = String(obj?.type || "").trim().toLowerCase();
    const plan = normalizePlan(obj?.plan);

    return {
      ok: obj?.ok === true,
      type: type || "anon",
      plan: type === "guest" ? "FREE" : plan || (type === "user" ? "FREE" : ""),
      uid: String(obj?.uid || "").trim(),
      email: String(obj?.email || "").trim().toLowerCase(),
      raw: obj,
    };
  } catch {
    return {
      ok: true,
      type: "user",
      plan: "FREE",
      uid: "",
      email: "",
      raw: null,
    };
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

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 980;
  });

  useEffect(() => {
    if (!isMobile) setSidebarOpen(true);
    else setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        setSession(readSession());
        return;
      }

      if (safeReadLS(LS_GUEST_ACTIVE_KEY) === "1") {
        setSession({
          ok: true,
          type: "guest",
          plan: "FREE",
          uid: "",
          email: "",
          raw: null,
        });
        return;
      }

      setSession({
        ok: false,
        type: "anon",
        plan: "",
        uid: "",
        email: "",
        raw: null,
      });
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    const refresh = () => setSession(readSession());

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) {
        refresh();
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const isGuest = session?.type === "guest";
  const planLabel = isGuest ? "PREVIEW" : normalizePlan(session?.plan) || "FREE";

  useEffect(() => {
    const isDashboard = active === ROUTES.DASHBOARD;

    const prevHtmlOverflow = document?.documentElement?.style?.overflow;
    const prevBodyOverflow = document?.body?.style?.overflow;

    const mustLock = (!isMobile && isDashboard) || (isMobile && sidebarOpen);

    if (mustLock) {
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = prevHtmlOverflow || "";
      document.body.style.overflow = prevBodyOverflow || "";
    }

    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow || "";
      document.body.style.overflow = prevBodyOverflow || "";
    };
  }, [active, isMobile, sidebarOpen]);

  useEffect(() => {
    if (!isMobile) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobile]);

  const handleNavigate = async (key) => {
    if (!key) return;

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

  const UI = useMemo(() => {
    const GOLD = "rgba(202,166,75,1)";
    const GOLD_SOFT = "rgba(202,166,75,0.18)";
    const GOLD_SOFT_2 = "rgba(202,166,75,0.10)";
    const WHITE = "rgba(255,255,255,0.92)";
    const MUTED = "rgba(255,255,255,0.58)";
    const BORDER = "rgba(255,255,255,0.10)";
    const BG = "#050505";

    const SAFE_TOP = "env(safe-area-inset-top, 0px)";

    const sidebarW = isMobile ? 88 : 96;
    const isDashboard = active === ROUTES.DASHBOARD;

    const shell = {
      minHeight: "100dvh",
      maxHeight: "100dvh",
      height: "100dvh",
      background: BG,
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "row",
    };

    const sidebarBase = {
      width: sidebarW,
      minWidth: sidebarW,
      height: "100%",
      borderRight: `1px solid ${BORDER}`,
      background:
        "linear-gradient(180deg, rgba(12,12,12,0.98) 0%, rgba(8,8,8,0.98) 52%, rgba(5,5,5,1) 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 0,
      padding: "12px 10px 14px",
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
      gap: 12,
      paddingTop: 8,
      paddingBottom: 14,
      marginBottom: 10,
      borderBottom: `1px solid ${BORDER}`,
    };

    const logoWrap = {
      width: "100%",
      minHeight: 62,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    };

    const plan = {
      minWidth: 64,
      textAlign: "center",
      fontSize: 11,
      fontWeight: 900,
      padding: "8px 12px",
      borderRadius: 999,
      border: `1px solid ${GOLD_SOFT}`,
      color: GOLD,
      background:
        "linear-gradient(180deg, rgba(202,166,75,0.10), rgba(0,0,0,0.22))",
      letterSpacing: 0.4,
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
    };

    const nav = {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: 8,
      paddingTop: 2,
      alignItems: "center",
      overflow: "auto",
      flex: 1,
      WebkitOverflowScrolling: "touch",
    };

    const navDivider = {
      width: "100%",
      height: 1,
      minHeight: 1,
      margin: "6px 0 4px",
      background:
        "linear-gradient(90deg, rgba(255,255,255,0.00) 0%, rgba(255,255,255,0.10) 18%, rgba(202,166,75,0.18) 50%, rgba(255,255,255,0.10) 82%, rgba(255,255,255,0.00) 100%)",
      borderRadius: 999,
    };

    const btn = (isActive) => ({
      position: "relative",
      width: "100%",
      height: 46,
      borderRadius: 14,
      border: `1px solid ${isActive ? "rgba(202,166,75,0.55)" : BORDER}`,
      background: isActive
        ? "linear-gradient(180deg, rgba(202,166,75,0.16), rgba(0,0,0,0.38))"
        : "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.22))",
      color: WHITE,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      boxShadow: isActive
        ? "0 14px 36px rgba(0,0,0,0.55), inset 3px 0 0 rgba(202,166,75,0.95)"
        : "inset 0 0 0 1px rgba(255,255,255,0.015)",
      transition:
        "transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease",
      outline: "none",
    });

    const btnMarker = (isActive) => ({
      position: "absolute",
      left: 0,
      top: 8,
      bottom: 8,
      width: 3,
      borderRadius: "0 999px 999px 0",
      background: isActive ? GOLD : "transparent",
      boxShadow: isActive ? `0 0 12px ${GOLD_SOFT}` : "none",
    });

    const btnHoverHint = {
      position: "absolute",
      inset: 0,
      borderRadius: 14,
      boxShadow: `inset 0 0 0 1px ${GOLD_SOFT_2}`,
      pointerEvents: "none",
    };

    const footerHint = {
      marginTop: "auto",
      paddingTop: 10,
      width: "100%",
      display: "flex",
      justifyContent: "center",
      color: MUTED,
      fontSize: 10,
    };

    const main = {
      flex: 1,
      minWidth: 0,
      height: "100%",
      overflow: !isMobile && isDashboard ? "hidden" : "auto",
      WebkitOverflowScrolling: "touch",
      position: "relative",
      zIndex: 1,
    };

    const mobileTopBar = isMobile
      ? {
          position: "sticky",
          top: 0,
          zIndex: 40,
          padding: `calc(${SAFE_TOP} + 10px) 0 8px 10px`,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.72), rgba(0,0,0,0.22), rgba(0,0,0,0))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }
      : { display: "none" };

    const mobileMenuBtn = isMobile
      ? {
          width: 48,
          height: 48,
          borderRadius: 14,
          border: `1px solid ${BORDER}`,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.38))",
          boxShadow: "0 14px 36px rgba(0,0,0,0.55)",
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
        }
      : { display: "none" };

    const mainInner =
      !isMobile && isDashboard
        ? { minWidth: 0, height: "100%", overflow: "hidden" }
        : { minWidth: 0 };

    return {
      shell,
      sidebar,
      overlay,
      brand,
      logoWrap,
      plan,
      nav,
      navDivider,
      btn,
      btnMarker,
      btnHoverHint,
      footerHint,
      main,
      mobileTopBar,
      mobileMenuBtn,
      mainInner,
    };
  }, [isMobile, sidebarOpen, active]);

  const menuPrimary = [
    { key: ROUTES.DASHBOARD, icon: "home", title: "Dashboard" },
    { key: ROUTES.RESULTS, icon: "calendar", title: "Resultados" },
    { key: ROUTES.TOP3, icon: "trophy", title: "Top 3" },
    { key: ROUTES.LATE, icon: "clock", title: "Atrasados" },
  ];

  const menuTools = [
    { key: ROUTES.SEARCH, icon: "search", title: "Busca" },
    { key: ROUTES.CENTENAS, icon: "hash", title: "Centenas" },
    { key: ROUTES.DOWNLOADS, icon: "download", title: "Downloads" },
  ];

  const menuAccount = [
    { key: ROUTES.ACCOUNT, icon: "user", title: "Minha Conta" },
  ];

  const renderMenuButton = (item) => {
    const isActive = active === item.key;

    return (
      <button
        key={item.key}
        onClick={() => handleNavigate(item.key)}
        title={item.title}
        style={UI.btn(isActive)}
        aria-current={isActive ? "page" : undefined}
        aria-label={item.title}
        type="button"
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "rgba(202,166,75,0.28)";
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow =
              "0 10px 24px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(202,166,75,0.08)";
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow =
              "inset 0 0 0 1px rgba(255,255,255,0.015)";
          }
        }}
      >
        <span style={UI.btnMarker(isActive)} />
        <span style={UI.btnHoverHint} />
        <Icon name={item.icon} size={22} />
      </button>
    );
  };

  return (
    <div style={UI.shell}>
      <div
        style={UI.overlay}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside style={UI.sidebar} aria-label="Menu lateral">
        <div style={UI.brand}>
          <div style={UI.logoWrap}>
            <MiniLogo size={52} />
          </div>
          <div style={UI.plan}>{planLabel}</div>
        </div>

        <nav style={UI.nav} role="navigation" aria-label="Navegação principal">
          {menuPrimary.map(renderMenuButton)}

          <div style={UI.navDivider} />

          {menuTools.map(renderMenuButton)}

          <div style={UI.navDivider} />

          {menuAccount.map(renderMenuButton)}

          <button
            onClick={() => handleNavigate("__LOGOUT__")}
            title={isGuest ? "Sair do Preview" : "Sair"}
            style={UI.btn(false)}
            aria-label={isGuest ? "Sair do Preview" : "Sair"}
            type="button"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(202,166,75,0.28)";
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 10px 24px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(202,166,75,0.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "inset 0 0 0 1px rgba(255,255,255,0.015)";
            }}
          >
            <span style={UI.btnMarker(false)} />
            <span style={UI.btnHoverHint} />
            <Icon name="logout" size={22} />
          </button>

          <div style={UI.footerHint}>Palpitaco JB</div>
        </nav>
      </aside>

      <main style={UI.main}>
        <div style={UI.mobileTopBar}>
          <button
            type="button"
            style={UI.mobileMenuBtn}
            onClick={() => setSidebarOpen(true)}
            title="Menu"
            aria-label="Abrir menu"
          >
            <Icon name="menu" size={24} />
          </button>
        </div>

        <div style={UI.mainInner}>{children}</div>
      </main>
    </div>
  );
}