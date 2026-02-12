// src/App.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

  // ✅ default só quando realmente não veio nada
  if (!raw) return "PT_RIO";

  // base para comparar aliases (minúsculo, sem acento)
  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // ✅ aliases conhecidos
  if (key === "federal" || key === "fed" || key === "br" || key === "brasil") {
    return "FEDERAL";
  }

  if (key === "rj" || key === "rio" || key === "pt_rio" || key === "pt-rio") {
    return "PT_RIO";
  }

  // ✅ qualquer outra loteria: retorna canônico (UPPER + underscore)
  // Exemplos:
  //  "pt-rio" => PT_RIO (cai acima)
  //  "look"   => LOOK
  //  "sp"     => SP
  //  "pt rio" => PT_RIO (não, aqui vira PT_RIO só se bater alias; senão PT_RIO? -> não)
  //  "nacional" => NACIONAL (se vier assim)
  const out = key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  // fallback defensivo (não deve acontecer)
  return out || "PT_RIO";
}
function loteriaToLotteryKey(loteria) {
  return normalizeLoteriaInput(loteria);
}

function getDefaultDashboardFilters() {
  return {
    // ✅ NOVO: loteria persistente
    loteria: "PT_RIO",

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

  // ✅ coerência: FEDERAL => horário deve ser 19h ou 20h (default 20h)
  const horario =
    loteria === "FEDERAL"
      ? obj.horario === "19h" || obj.horario === "20h"
        ? obj.horario
        : "20h"
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
        this.state.err?.message ||
        String(this.state.err || "Erro desconhecido");
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
          <div
            style={{
              opacity: 0.85,
              whiteSpace: "pre-wrap",
              lineHeight: 1.35,
            }}
          >
            {msg}
          </div>
          <div style={{ marginTop: 12, opacity: 0.7, fontSize: 12 }}>
            Dica: abra o Console (F12). Se aparecer “[IMPORT INVALID] …”, o
            import desse componente está errado (default vs named).
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/* =========================
   URL <-> Screen sync
========================= */

function cleanPathname(p) {
  const s = String(p || "").trim();
  if (!s) return "/";
  return s.startsWith("/") ? s : `/${s}`;
}

function screenToPath(screen) {
  switch (screen) {
    case ROUTES.LOGIN:
      return "/login";
    case ROUTES.DASHBOARD:
      return "/";
    case ROUTES.ACCOUNT:
      return "/account";
    case ROUTES.RESULTS:
      return "/results";
    case ROUTES.TOP3:
      return "/top3";
    case ROUTES.LATE:
      return "/late";
    case ROUTES.SEARCH:
      return "/search";
    case ROUTES.PAYMENTS:
      return "/payments";
    case ROUTES.DOWNLOADS:
      return "/downloads";
    case ROUTES.CENTENAS:
      return "/centenas";
    default:
      return "/";
  }
}

function pathToScreen(pathname) {
  const p = cleanPathname(pathname).toLowerCase();

  if (p === "/" || p === "/dashboard") return ROUTES.DASHBOARD;
  if (p === "/login") return ROUTES.LOGIN;

  if (p === "/account") return ROUTES.ACCOUNT;
  if (p === "/results") return ROUTES.RESULTS;
  if (p === "/top3") return ROUTES.TOP3;
  if (p === "/late") return ROUTES.LATE;
  if (p === "/search") return ROUTES.SEARCH;
  if (p === "/payments") return ROUTES.PAYMENTS;
  if (p === "/downloads") return ROUTES.DOWNLOADS;
  if (p === "/centenas") return ROUTES.CENTENAS;

  return null;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // ✅ trava de boot para evitar "screen -> URL" atropelar deep-link (/centenas etc.)
  const bootRef = useRef(false);
  const [routerBooted, setRouterBooted] = useState(false);

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

  const [dashboardFilters, setDashboardFilters] = useState(() =>
    loadDashboardFilters()
  );

  // ✅ garante coerência:
// - FEDERAL => horário 19h ou 20h (default 20h)
// - outras loterias => NÃO força PT_RIO; apenas normaliza aliases (ex.: "rio" => PT_RIO)
useEffect(() => {
  const lot = normalizeLoteriaInput(dashboardFilters?.loteria);

  if (lot === "FEDERAL") {
    const h = String(dashboardFilters?.horario || "");
    if (h !== "19h" && h !== "20h") {
      setDashboardFilters((prev) => ({
        ...prev,
        loteria: "FEDERAL",
        horario: "20h",
      }));
    } else if (dashboardFilters?.loteria !== "FEDERAL") {
      setDashboardFilters((prev) => ({ ...prev, loteria: "FEDERAL" }));
    }
    return;
  }

  // ✅ só normaliza aliases/forma (ex.: "pt-rio" => "PT_RIO"), sem impor loteria
  if (dashboardFilters?.loteria !== lot) {
    setDashboardFilters((prev) => ({ ...prev, loteria: lot }));
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [dashboardFilters?.loteria, dashboardFilters?.horario]);
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

  /* =========================
     ✅ URL -> screen (somente app normal)
  ========================= */
  useEffect(() => {
    if (adminMode) return;

    // ✅ marca boot na primeira passagem desse effect
    if (!bootRef.current) {
      bootRef.current = true;
      setRouterBooted(true);
    }

    const wanted = pathToScreen(location?.pathname);
    if (!wanted) return;

    // se não tem sessão, força login
    if (!hasActiveSession()) {
      if (screen !== ROUTES.LOGIN) setScreen(ROUTES.LOGIN);
      return;
    }

    // se tem sessão e a rota é /login, manda dashboard
    if (wanted === ROUTES.LOGIN) {
      if (screen !== ROUTES.DASHBOARD) setScreen(ROUTES.DASHBOARD);
      return;
    }

    if (wanted !== screen) setScreen(wanted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.pathname, adminMode]);

  /* =========================
     ✅ screen -> URL (somente app normal)
     (deps completas, mesma lógica)
  ========================= */
  useEffect(() => {
    if (adminMode) return;
    if (!routerBooted) return;

    const wanted = pathToScreen(location?.pathname);
    if (wanted && wanted !== screen) return;

    const path = screenToPath(screen);
    const cur = cleanPathname(location?.pathname);

    if (cur !== path) {
      navigate(path, { replace: true });
    }
  }, [screen, adminMode, routerBooted, location?.pathname, navigate]);

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
            filters={{
              ...dashboardFilters,
              lotteryKey: loteriaToLotteryKey(dashboardFilters?.loteria),
            }}
            setFilters={setDashboardFilters}
          />
        );
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
          <Dashboard
            filters={{
              ...dashboardFilters,
              lotteryKey: loteriaToLotteryKey(dashboardFilters?.loteria),
            }}
            setFilters={setDashboardFilters}
          />
        ) : (
          <PageRouter screen={screen} />
        )}
      </AppShell>
    </ErrorBoundary>
  );
}


