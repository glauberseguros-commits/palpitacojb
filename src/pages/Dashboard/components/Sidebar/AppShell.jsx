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

export default function AppShell({
  active,
  onNavigate,
  onLogout,
  children,
}) {
  const [session, setSession] = useState(() => readSession());
  const [moreOpen, setMoreOpen] = useState(false);

  /* ======================
     Sync Firebase Auth
     (SEM navegação automática)
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

  /* ======================
     Navegação
  ====================== */
  const handleNavigate = async (key) => {
    if (!key) return;

    if (key === "__MORE__") {
      setMoreOpen(true);
      return;
    }

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
     UI
  ====================== */
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
    <div className="pp_shell">
      <aside className="pp_sidebar">
        <div className="pp_brand">
          <MiniLogo />
          <div className="pp_planPill">{isGuest ? "PREVIEW" : "FREE"}</div>
        </div>

        <nav className="pp_nav">
          {menu.map((m) => (
            <button
              key={m.key}
              className={`pp_nav_item ${active === m.key ? "isActive" : ""}`}
              onClick={() => handleNavigate(m.key)}
              title={m.title}
            >
              <Icon name={m.icon} />
            </button>
          ))}

          <button
            className="pp_nav_item"
            onClick={() => handleNavigate("__LOGOUT__")}
            title={isGuest ? "Sair do Preview" : "Sair"}
          >
            <Icon name="logout" />
          </button>
        </nav>
      </aside>

      <main className="pp_main">{children}</main>
    </div>
  );
}
