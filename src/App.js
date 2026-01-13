// src/App.js
import React, { useEffect, useMemo, useState } from "react";

import DashboardMod from "./pages/Dashboard/Dashboard";
import AccountMod from "./pages/Account/Account";
import ResultsMod from "./pages/Results/Results";
import Top3Mod from "./pages/Top3/Top3";
import LateMod from "./pages/Late/Late";
import SearchMod from "./pages/Search/Search";


// ✅ Páginas placeholder
import PaymentsMod from "./pages/Payments/Payments";
import DownloadsMod from "./pages/Downloads/Downloads";

// ✅ NOVO: página de Centenas
import CentenasMod from "./pages/Centenas/Centenas.jsx";

// ✅ AppShell
import AppShellMod from "./pages/Dashboard/components/Sidebar/AppShell";

import LoginVisualMod from "./pages/Account/LoginVisual";

const STORAGE_KEY = "palpitaco_screen_v2";
const ACCOUNT_SESSION_KEY = "pp_session_v1";

// ✅ Persistência de filtros do Dashboard (não resetar ao trocar de página)
const DASH_FILTERS_KEY = "pp_dashboard_filters_v1";

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

  // ✅ NOVO
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

function hasActiveSession() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) return false;

  const s = String(raw).trim();
  if (!s) return false;

  if (s.startsWith("{")) {
    try {
      const obj = JSON.parse(s);
      return !!(obj && (obj.ts || obj.loginId || obj.active));
    } catch {
      return true;
    }
  }

  return true;
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
   Dashboard filters (persist)
========================= */

function getDefaultDashboardFilters() {
  return {
    mes: "Todos",
    diaMes: "Todos",
    diaSemana: "Todos",
    horario: "Todos",
    animal: "Todos",
    posicao: "Todos",
  };
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadDashboardFilters() {
  const raw = safeReadLS(DASH_FILTERS_KEY);
  if (!raw) return getDefaultDashboardFilters();

  const obj = safeParseJson(raw);
  if (!obj || typeof obj !== "object") return getDefaultDashboardFilters();

  const base = getDefaultDashboardFilters();

  const next = {
    mes: typeof obj.mes === "string" ? obj.mes : base.mes,
    diaMes: typeof obj.diaMes === "string" ? obj.diaMes : base.diaMes,
    diaSemana: typeof obj.diaSemana === "string" ? obj.diaSemana : base.diaSemana,
    horario: typeof obj.horario === "string" ? obj.horario : base.horario,
    animal: typeof obj.animal === "string" ? obj.animal : base.animal,
    posicao: typeof obj.posicao === "string" ? obj.posicao : base.posicao,
  };

  return next;
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
  const LoginVisual = useMemo(
    () => resolveComponent(LoginVisualMod, "LoginVisual"),
    []
  );

  const [screen, setScreen] = useState(() => {
    const sessionOn = hasActiveSession();
    const saved = normalizeRoute(safeReadLS(STORAGE_KEY));

    if (!sessionOn) return ROUTES.LOGIN;
    if (saved && saved !== ROUTES.LOGIN) return saved;
    return ROUTES.DASHBOARD;
  });

  useEffect(() => {
    safeWriteLS(STORAGE_KEY, screen);
  }, [screen]);

  const [dashboardFilters, setDashboardFilters] = useState(() =>
    loadDashboardFilters()
  );

  useEffect(() => {
    safeWriteLS(DASH_FILTERS_KEY, JSON.stringify(dashboardFilters));
  }, [dashboardFilters]);

  const ensureSession = (payload = {}) => {
    safeWriteLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ active: true, ts: Date.now(), ...payload })
    );
  };

  const logout = () => {
    safeRemoveLS(STORAGE_KEY);
    safeRemoveLS(ACCOUNT_SESSION_KEY);
    safeRemoveLS(DASH_FILTERS_KEY);
    setScreen(ROUTES.LOGIN);
  };

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
        return (
          <Dashboard
            filters={dashboardFilters}
            setFilters={setDashboardFilters}
          />
        );
    }
  };

  if (screen === ROUTES.LOGIN) {
    return (
      <ErrorBoundary>
        <LoginVisual
          onEnter={({ loginId }) => {
            ensureSession({ loginId });
            setScreen(ROUTES.DASHBOARD);
          }}
          onSkip={() => {
            ensureSession({ loginId: "" });
            setScreen(ROUTES.DASHBOARD);
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell active={screen} onNavigate={setScreen} onLogout={logout}>
        {screen === ROUTES.DASHBOARD ? (
          <Dashboard
            filters={dashboardFilters}
            setFilters={setDashboardFilters}
          />
        ) : (
          <PageRouter screen={screen} />
        )}
      </AppShell>
    </ErrorBoundary>
  );
}
