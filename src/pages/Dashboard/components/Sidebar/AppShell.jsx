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
function safeReadLS(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeWriteLS(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
function safeRemoveLS(k) {
  try {
    localStorage.removeItem(k);
  } catch {}
}
function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function dispatchSessionChanged() {
  try {
    window.dispatchEvent(new Event("pp_session_changed"));
  } catch {}
}

function readGuestActive() {
  try {
    return localStorage.getItem(LS_GUEST_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * ✅ Normaliza a sessão (compatível com App.js / Account.jsx / LoginVisual.jsx)
 * Formato esperado:
 * - { ok:true, type:"guest"|"user", plan:"FREE"|"PRO"|"VIP", ... }
 */
function readSession() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) return { ok: false, type: "none", plan: "FREE" };

  const s = String(raw || "").trim();
  if (!s) return { ok: false, type: "none", plan: "FREE" };

  if (!s.startsWith("{")) {
    // legacy: qualquer string não vazia
    return { ok: true, type: "user", plan: "FREE" };
  }

  const obj = safeParseJson(s);
  if (!obj || typeof obj !== "object") return { ok: false, type: "none", plan: "FREE" };

  const ok = obj.ok === true || obj.ok == null; // tolera sessão antiga sem ok
  const typeRaw = String(obj.type || obj.mode || "").trim().toLowerCase();
  const planRaw = String(obj.plan || "FREE").trim().toUpperCase();

  const type = typeRaw === "guest" ? "guest" : typeRaw === "user" ? "user" : "user";
  const plan = planRaw === "VIP" ? "VIP" : planRaw === "PRO" ? "PRO" : "FREE";

  return { ok: !!ok, type, plan, raw: obj };
}

function writeSession(obj) {
  safeWriteLS(ACCOUNT_SESSION_KEY, JSON.stringify(obj));
  // storage não dispara no mesmo tab, então disparamos manualmente
  dispatchSessionChanged();
}

export default function AppShell({ active, onNavigate, onLogout, children }) {
  // ✅ sessão reativa
  const [session, setSession] = useState(() => readSession());

  // ✅ refaz leitura quando localStorage mudar (outros tabs) OU evento interno
  useEffect(() => {
    const sync = () => setSession(readSession());

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", sync);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", sync);
    };
  }, []);

  /* ======================
     Sync Firebase Auth
     (SEM navegação automática)
  ====================== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      // user logado de verdade
      if (user?.uid) {
        writeSession({
          ok: true,
          type: "user",
          plan: "FREE",
          uid: user.uid,
          email: String(user.email || "").trim().toLowerCase(),
          ts: Date.now(),
        });
        setSession(readSession());
        return;
      }

      // sem user: se guest ativo, mantém guest; se não, limpa sessão
      if (readGuestActive()) {
        writeSession({ ok: true, type: "guest", plan: "FREE", ts: Date.now() });
        setSession(readSession());
      } else {
        safeRemoveLS(ACCOUNT_SESSION_KEY);
        dispatchSessionChanged();
        setSession(readSession());
      }
    });

    return () => unsub?.();
  }, []);

  const isGuest = !!session?.ok && session?.type === "guest";
  const plan = String(session?.plan || "FREE").toUpperCase();

  const planLabel = useMemo(() => {
    if (isGuest) return "PREVIEW";
    if (plan === "VIP") return "VIP";
    if (plan === "PRO") return "PRO";
    return "FREE";
  }, [isGuest, plan]);

  /* ======================
     Navegação
  ====================== */
  const handleNavigate = async (key) => {
    if (!key) return;

    if (key === "__LOGOUT__") {
      // logout real do Firebase (se houver)
      try {
        await signOut(auth);
      } catch {}

      // limpa sessão local
      safeRemoveLS(ACCOUNT_SESSION_KEY);
      safeRemoveLS(LS_GUEST_ACTIVE_KEY);
      dispatchSessionChanged();

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
    { key: ROUTES.ACCOUNT, icon: "user", title: isGuest ? "Entrar / Minha Conta" : "Minha Conta" },
  ];

  return (
    <div className="pp_shell">
      <aside className="pp_sidebar">
        <div className="pp_brand" title="Palpitaco">
          <MiniLogo />
          <div className="pp_planPill">{planLabel}</div>
        </div>

        <nav className="pp_nav" aria-label="Menu">
          {menu.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`pp_nav_item ${active === m.key ? "isActive" : ""}`}
              onClick={() => handleNavigate(m.key)}
              title={m.title}
              aria-label={m.title}
              aria-current={active === m.key ? "page" : undefined}
            >
              <Icon name={m.icon} />
            </button>
          ))}

          <button
            type="button"
            className="pp_nav_item"
            onClick={() => handleNavigate("__LOGOUT__")}
            title={isGuest ? "Sair do Preview" : "Sair"}
            aria-label={isGuest ? "Sair do Preview" : "Sair"}
          >
            <Icon name="logout" />
          </button>
        </nav>
      </aside>

      <main className="pp_main">{children}</main>
    </div>
  );
}
