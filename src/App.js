// src/App.js
import React, { useEffect, useMemo, useState } from "react";

import DashboardMod from "./pages/Dashboard/Dashboard";
import AccountMod from "./pages/Account/Account";
import ResultsMod from "./pages/Results/Results";
import Top3Mod from "./pages/Top3/Top3";
import LateMod from "./pages/Late/Late";
import SearchMod from "./pages/Search/Search";

// ✅ Admin (apenas UMA vez)
import AdminMod from "./pages/Admin/Admin.jsx";
import AdminLoginMod from "./pages/Admin/AdminLogin.jsx";

// ✅ Páginas placeholder
import PaymentsMod from "./pages/Payments/Payments";
import DownloadsMod from "./pages/Downloads/Downloads";

// ✅ página de Centenas
import CentenasMod from "./pages/Centenas/Centenas.jsx";

// ✅ AppShell
import AppShellMod from "./pages/Dashboard/components/Sidebar/AppShell";

// ✅ Firebase (Admin real)
import { auth, db } from "./services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "palpitaco_screen_v2";
const ACCOUNT_SESSION_KEY = "pp_session_v1";
const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

// ✅ Persistência de filtros do Dashboard (não resetar ao trocar de página)
const DASH_FILTERS_KEY = "pp_dashboard_filters_v1";

/* =========================
   Admin (hash gate)
========================= */

const ADMIN_HASH = "#admin";

const ROUTES = {
  LOGIN: "login",
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

function safeReadLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeWriteLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
function safeRemoveLS(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeRoute(saved) {
  if (!saved) return null;
  return Object.values(ROUTES).includes(saved) ? saved : null;
}

/**
 * ✅ Resolve default/named de forma robusta:
 */
function resolveComponent(mod, name) {
  const c = mod?.default ?? mod;

  const isProbablyReactComponent =
    typeof c === "function" ||
    (c && typeof c === "object" && String(c.$$typeof || "").includes("react."));

  if (!isProbablyReactComponent) {
    // eslint-disable-next-line no-console
    console.error(
      `[IMPORT INVALID] ${name} veio inválido:`,
      c,
      " | import raw:",
      mod
    );
  }

  return c;
}

/* =========================
   Sessão (robusta e compatível)
========================= */

/**
 * ✅ Lê sessão do localStorage e normaliza:
 * - aceita formato novo: { type:"user"/"guest", plan, uid }
 * - aceita formato antigo: { ok:true, ... }
 */
function loadSessionObj() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) return null;

  const s = String(raw || "").trim();
  if (!s) return null;

  // se não é JSON, ignora (outra versão)
  if (!s.startsWith("{")) return null;

  const obj = safeParseJson(s);
  if (!obj || typeof obj !== "object") return null;

  const type = String(obj.type || "").trim().toLowerCase();
  const ok =
    obj.ok === true ||
    type === "user" ||
    type === "guest" ||
    // fallback: se tiver uid, é user
    !!obj.uid;

  if (!ok) return null;

  return {
    ok: true,
    type: type === "guest" ? "guest" : "user",
    plan: String(obj.plan || "FREE").toUpperCase(),
    uid: obj.uid,
    raw: obj,
  };
}

function hasActiveSession() {
  return !!loadSessionObj();
}

/* =========================
   Dashboard filters (persist)
========================= */

function normalizeLoteriaInput(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return "RJ";
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (key === "federal" || key === "fed" || key === "br" || key === "brasil")
    return "FEDERAL";
  return "RJ";
}

function getDefaultDashboardFilters() {
  return {
    // ✅ NOVO: loteria persistente
    loteria: "RJ",

    mes: "Todos",
    diaMes: "Todos",
    diaSemana: "Todos",
    horario: "Todos",
    animal: "Todos",
    posicao: "Todos",
  };
}

function loadDashboardFilters() {
  const raw = safeReadLS(DASH_FILTERS_KEY);
  if (!raw) return getDefaultDashboardFilters();

  const obj = safeParseJson(raw);
  if (!obj || typeof obj !== "object") return getDefaultDashboardFilters();

  const base = getDefaultDashboardFilters();

  const loteria = normalizeLoteriaInput(obj.loteria);

  // ✅ coerência: FEDERAL => horário deve ser 20h
  const horario =
    loteria === "FEDERAL"
      ? "20h"
      : typeof obj.horario === "string"
      ? obj.horario
      : base.horario;

  return {
    loteria,

    mes: typeof obj.mes === "string" ? obj.mes : base.mes,
    diaMes: typeof obj.diaMes === "string" ? obj.diaMes : base.diaMes,
    diaSemana: typeof obj.diaSemana === "string" ? obj.diaSemana : base.diaSemana,
    horario,
    animal: typeof obj.animal === "string" ? obj.animal : base.animal,
    posicao: typeof obj.posicao === "string" ? obj.posicao : base.posicao,
  };
}

/* =========================
   Admin helpers (hash + Firestore role)
========================= */

function isAdminHashNow() {
  try {
    const h = String(window.location.hash || "").trim();
    return h === ADMIN_HASH || h.startsWith(`${ADMIN_HASH}?`);
  } catch {
    return false;
  }
}

// ✅ Regra Admin: existe /admins/{uid} e active !== false
async function isUidAdmin(uid) {
  const u = String(uid || "").trim();
  if (!u) return false;
  try {
    const ref = doc(db, "admins", u);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() || {};
    return data.active !== false; // default true
  } catch {
    return false;
  }
}

/**
 * ✅ ErrorBoundary simples
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, err: error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("App ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      const msg =
        this.state.err?.message || String(this.state.err || "Erro desconhecido");
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#050505",
            color: "rgba(255,255,255,0.92)",
            padding: 18,
            fontFamily:
              "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Falha ao renderizar a aplicação
          </div>
          <div style={{ opacity: 0.85, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
            {msg}
          </div>
          <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
            Dica: abra o Console (F12). Se aparecer “[IMPORT INVALID] …”, o import
            desse componente está errado (default vs named).
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const Dashboard = useMemo(() => resolveComponent(DashboardMod, "Dashboard"), []);
  const Account = useMemo(() => resolveComponent(AccountMod, "Account"), []);
  const Results = useMemo(() => resolveComponent(ResultsMod, "Results"), []);
  const Top3 = useMemo(() => resolveComponent(Top3Mod, "Top3"), []);
  const Late = useMemo(() => resolveComponent(LateMod, "Late"), []);
  const Search = useMemo(() => resolveComponent(SearchMod, "Search"), []);
  const Payments = useMemo(() => resolveComponent(PaymentsMod, "Payments"), []);
  const Downloads = useMemo(() => resolveComponent(DownloadsMod, "Downloads"), []);
  const Centenas = useMemo(() => resolveComponent(CentenasMod, "Centenas"), []);

  const AppShell = useMemo(() => resolveComponent(AppShellMod, "AppShell"), []);

  const Admin = useMemo(() => resolveComponent(AdminMod, "Admin"), []);
  const AdminLogin = useMemo(() => resolveComponent(AdminLoginMod, "AdminLogin"), []);

  // ✅ hash gate isolado
  const [adminMode, setAdminMode] = useState(() => isAdminHashNow());

  useEffect(() => {
    const onHash = () => setAdminMode(isAdminHashNow());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // ✅ fonte de verdade: Firebase Auth + /admins/{uid}
  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminBooting, setAdminBooting] = useState(false);

  // ✅ re-hidrata automaticamente quando entrar no #admin
  useEffect(() => {
    if (!adminMode) return;

    let alive = true;
    setAdminBooting(true);
    setAdminAuthed(false);

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      if (!user?.uid) {
        setAdminAuthed(false);
        setAdminBooting(false);
        return;
      }

      const ok = await isUidAdmin(user.uid);
      if (!alive) return;

      if (!ok) {
        try {
          await signOut(auth);
        } catch {}
        setAdminAuthed(false);
        setAdminBooting(false);
        return;
      }

      setAdminAuthed(true);
      setAdminBooting(false);
    });

    return () => {
      alive = false;
      unsub?.();
    };
  }, [adminMode]);

  /* ============================================================
     ✅ Blindagem: pós-login => sempre Dashboard
     - Nunca entra “automaticamente” em ACCOUNT
  ============================================================ */
  const [screen, setScreen] = useState(() => {
    const sessionOn = hasActiveSession();
    const saved = normalizeRoute(safeReadLS(STORAGE_KEY));

    if (!sessionOn) return ROUTES.LOGIN;

    // ✅ se tiver salvo, respeita EXCETO login/account
    if (saved && saved !== ROUTES.LOGIN && saved !== ROUTES.ACCOUNT) return saved;

    return ROUTES.DASHBOARD;
  });

  useEffect(() => {
    safeWriteLS(STORAGE_KEY, screen);
  }, [screen]);

  const [dashboardFilters, setDashboardFilters] = useState(() => loadDashboardFilters());

  // ✅ garante coerência: FEDERAL => horário 20h (mesmo se algum código setar errado)
  useEffect(() => {
    const lot = normalizeLoteriaInput(dashboardFilters?.loteria);
    if (lot === "FEDERAL" && dashboardFilters?.horario !== "20h") {
      setDashboardFilters((prev) => ({ ...prev, loteria: "FEDERAL", horario: "20h" }));
    }
    if (lot === "RJ" && dashboardFilters?.loteria !== "RJ") {
      setDashboardFilters((prev) => ({ ...prev, loteria: "RJ" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardFilters?.loteria]);

  useEffect(() => {
    safeWriteLS(DASH_FILTERS_KEY, JSON.stringify(dashboardFilters));
  }, [dashboardFilters]);

  const logout = () => {
    // ✅ limpa apenas o que é do navegador (LocalStorage)
    safeRemoveLS(STORAGE_KEY);
    safeRemoveLS(ACCOUNT_SESSION_KEY);
    safeRemoveLS(LS_GUEST_ACTIVE_KEY);
    safeRemoveLS(DASH_FILTERS_KEY);

    // ✅ avisa o próprio tab (se alguém estiver ouvindo)
    try {
      window.dispatchEvent(new Event("pp_session_changed"));
    } catch {}

    setScreen(ROUTES.LOGIN);
  };

  /**
   * ✅ Enquanto estiver no LOGIN:
   * Assim que a sessão existir (guest/user), entra no Dashboard.
   * Sem setInterval. Usa storage + evento interno.
   */
  useEffect(() => {
    if (adminMode) return;
    if (screen !== ROUTES.LOGIN) return;

    const goDashboard = () => {
      setScreen(ROUTES.DASHBOARD);
      safeWriteLS(STORAGE_KEY, ROUTES.DASHBOARD);
    };

    const check = () => {
      if (hasActiveSession()) goDashboard();
    };

    // checa já
    check();

    // outros tabs
    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) check();
    };

    // mesmo tab (se LoginVisual/Account disparar)
    const onSessionChanged = () => check();

    // reforço
    const onFocus = () => check();
    const onVis = () => check();

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", onSessionChanged);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", onSessionChanged);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [screen, adminMode]);

  const PageRouter = ({ screen: s }) => {
    switch (s) {
      case ROUTES.ACCOUNT:
        return <Account />;
      case ROUTES.RESULTS:
        return <Results />;
      case ROUTES.TOP3:
        return <Top3 />;
      case ROUTES.LATE:
        return <Late />;
      case ROUTES.SEARCH:
        return <Search />;
      case ROUTES.CENTENAS:
        return <Centenas />;
      case ROUTES.PAYMENTS:
        return <Payments />;
      case ROUTES.DOWNLOADS:
        return <Downloads />;
      default:
        return <Dashboard filters={dashboardFilters} setFilters={setDashboardFilters} />;
    }
  };

  /* =========================
     ✅ Admin Router (isolado)
  ========================= */

  if (adminMode) {
    return (
      <ErrorBoundary>
        {adminBooting ? (
          <div
            style={{
              minHeight: "100vh",
              background: "#050505",
              color: "rgba(255,255,255,0.85)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily:
                "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
              padding: 18,
            }}
          >
            Carregando Admin...
          </div>
        ) : adminAuthed ? (
          <Admin
            onExit={() => {
              try {
                window.location.hash = "";
              } catch {}
            }}
            onLogout={async () => {
              try {
                await signOut(auth);
              } catch {}
              setAdminAuthed(false);
              try {
                window.location.hash = "";
              } catch {}
            }}
          />
        ) : (
          <AdminLogin
            onCancel={() => {
              try {
                window.location.hash = "";
              } catch {}
            }}
            onAuthed={() => {
              setAdminAuthed(true);
            }}
          />
        )}
      </ErrorBoundary>
    );
  }

  /* =========================
     App normal
     ✅ LOGIN agora é o Account (ele renderiza LoginVisual internamente)
  ========================= */

  if (screen === ROUTES.LOGIN) {
    return (
      <ErrorBoundary>
        <Account
          onClose={() => {
            // mantém no login
            setScreen(ROUTES.LOGIN);
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell active={screen} onNavigate={setScreen} onLogout={logout}>
        {screen === ROUTES.DASHBOARD ? (
          <Dashboard filters={dashboardFilters} setFilters={setDashboardFilters} />
        ) : (
          <PageRouter screen={screen} />
        )}
      </AppShell>
    </ErrorBoundary>
  );
}
