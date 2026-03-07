import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import DashboardMod from "./pages/Dashboard/Dashboard";
import AccountMod from "./pages/Account/Account";
import ResultsMod from "./pages/Results/Results";
import Top3Mod from "./pages/Top3/Top3";
import LateMod from "./pages/Late/Late";
import SearchMod from "./pages/Search/Search";

// ✅ Admin
import AdminMod from "./pages/Admin/Admin";
import AdminLoginMod from "./pages/Admin/AdminLogin";

// ✅ Páginas placeholder
import PaymentsMod from "./pages/Payments/Payments";
import DownloadsMod from "./pages/Downloads/Downloads";

// ✅ página de Centenas
import CentenasMod from "./pages/Centenas/Centenas";

// ✅ AppShell
import AppShellMod from "./pages/Dashboard/components/Sidebar/AppShell";

// ✅ Firebase (Admin real / Auth real)
import { auth, db } from "./services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const STORAGE_KEY = "palpitaco_screen_v2";
const ACCOUNT_SESSION_KEY = "pp_session_v1";
const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

// ✅ Persistência de filtros do Dashboard (não resetar ao trocar de página)
const DASH_FILTERS_KEY = "pp_dashboard_filters_v1";

/* =========================
   ✅ Build stamp (Vercel)
========================= */
const BUILD_SHA = String(process.env.REACT_APP_BUILD_SHA || "").trim();
const BUILD_REF = String(process.env.REACT_APP_BUILD_REF || "").trim();
const BUILD_TIME = String(process.env.REACT_APP_BUILD_TIME || "").trim();

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
 * ✅ Resolve default/named de forma robusta
 */
function resolveComponent(mod, name) {
  const c = mod?.default ?? mod;

  const isProbablyReactComponent =
    typeof c === "function" ||
    (c && typeof c === "object" && String(c.$$typeof || "").includes("react."));

  if (!isProbablyReactComponent) {
    console.error(`[IMPORT INVALID] ${name} veio inválido:`, c, " | import raw:", mod);
  }

  return c;
}

/* =========================
   Sessão (estrita)
========================= */

function normalizePlan(plan) {
  const p = String(plan || "").trim().toUpperCase();
  if (p === "VIP") return "VIP";
  if (p === "PREMIUM") return "PREMIUM";
  if (p === "FREE") return "FREE";
  return "";
}

function loadSessionObj() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) return null;

  const s = String(raw || "").trim();
  if (!s || !s.startsWith("{")) return null;

  const obj = safeParseJson(s);
  if (!obj || typeof obj !== "object") return null;

  const type = String(obj.type || "").trim().toLowerCase();
  const uid = String(obj.uid || "").trim();
  const email = String(obj.email || "").trim().toLowerCase();
  const ok = obj.ok === true;
  const plan = normalizePlan(
    obj.plan ??
      obj.profile?.plan ??
      obj.subscription?.plan ??
      obj.account?.plan ??
      obj.customClaims?.plan ??
      obj.claims?.plan ??
      obj.appData?.plan ??
      obj.metadata?.plan
  );

  if (!ok) return null;

  // guest real
  if (type === "guest") {
    return {
      ok: true,
      type: "guest",
      plan: plan || "FREE",
      uid: "",
      email: "",
      raw: obj,
    };
  }

  // user real/local válido
  if (type === "user" && uid) {
    return {
      ok: true,
      type: "user",
      plan: plan || "PREMIUM",
      uid,
      email,
      raw: obj,
    };
  }

  // fallback legado: se tiver uid/email sem type coerente, ainda considera user
  if (uid || email) {
    return {
      ok: true,
      type: "user",
      plan: plan || "PREMIUM",
      uid,
      email,
      raw: obj,
    };
  }

  return null;
}

function getSessionKind(sess) {
  const s = sess || loadSessionObj();
  if (!s || s.ok !== true) return "anon";
  return s.type === "guest" ? "guest" : s.type === "user" ? "user" : "anon";
}

function hasActiveSession() {
  const sess = loadSessionObj();
  return !!sess;
}

function cleanupLegacyGuestFlagIfNeeded() {
  const sess = loadSessionObj();
  const guestFlag = safeReadLS(LS_GUEST_ACTIVE_KEY);

  // remove flag legado quando já existe sessão formal
  if (sess && guestFlag != null) {
    safeRemoveLS(LS_GUEST_ACTIVE_KEY);
    return;
  }

  // remove flag órfã
  if (!sess && guestFlag != null) {
    safeRemoveLS(LS_GUEST_ACTIVE_KEY);
  }
}

/* =========================
   Dashboard filters (persist)
========================= */

function normalizeLoteriaInput(v) {
  const raw = String(v ?? "").trim();
  if (!raw) return "PT_RIO";

  const key = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (key === "federal" || key === "fed" || key === "br" || key === "brasil") {
    return "FEDERAL";
  }

  if (key === "rj" || key === "rio" || key === "pt_rio" || key === "pt-rio") {
    return "PT_RIO";
  }

  const out = key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return out || "PT_RIO";
}

function loteriaToLotteryKey(loteria) {
  return normalizeLoteriaInput(loteria);
}

function getDefaultDashboardFilters() {
  return {
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

  const horario =
    loteria === "FEDERAL"
      ? obj.horario === "Todos" || obj.horario === "19h" || obj.horario === "20h"
        ? obj.horario
        : "Todos"
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
   Admin helpers
========================= */

function isAdminHashNow() {
  try {
    const h = String(window.location.hash || "").trim();
    return h === ADMIN_HASH || h.startsWith(`${ADMIN_HASH}?`);
  } catch {
    return false;
  }
}

async function isUidAdmin(uid) {
  const u = String(uid || "").trim();
  if (!u) return false;
  try {
    const ref = doc(db, "admins", u);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;
    const data = snap.data() || {};
    return data.active !== false;
  } catch {
    return false;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, err: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, err: error };
  }

  componentDidCatch(error, info) {
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

function BuildStamp() {
  const shaShort = BUILD_SHA ? BUILD_SHA.slice(0, 7) : "";
  const ref = BUILD_REF || "";
  const tm = BUILD_TIME || "";
  const text = shaShort
    ? `build ${shaShort}${ref ? ` · ${ref}` : ""}${tm ? ` · ${tm}` : ""}`
    : "";

  if (!shaShort) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 10,
        bottom: 10,
        zIndex: 99999,
        padding: "7px 10px",
        borderRadius: 999,
        background: "rgba(0,0,0,0.62)",
        border: "1px solid rgba(202,166,75,0.28)",
        color: "rgba(233,233,233,0.88)",
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: 0.2,
        boxShadow: "0 14px 40px rgba(0,0,0,0.40)",
        userSelect: "text",
      }}
      title={`SHA=${BUILD_SHA}${ref ? ` | ref=${ref}` : ""}${tm ? ` | time=${tm}` : ""}`}
    >
      {text}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

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

  useEffect(() => {
    console.log("[PALPITACO BUILD]", {
      sha: BUILD_SHA || "(none)",
      ref: BUILD_REF || "(none)",
      time: BUILD_TIME || "(none)",
      href: typeof window !== "undefined" ? window.location.href : "",
    });
  }, []);

  useEffect(() => {
    cleanupLegacyGuestFlagIfNeeded();
  }, []);

  const [adminMode, setAdminMode] = useState(() => isAdminHashNow());

  useEffect(() => {
    const onHash = () => setAdminMode(isAdminHashNow());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [adminAuthed, setAdminAuthed] = useState(false);
  const [adminBooting, setAdminBooting] = useState(false);

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

  const [screen, setScreen] = useState(() => {
    const session = loadSessionObj();
    const saved = normalizeRoute(safeReadLS(STORAGE_KEY));

    if (!session) return ROUTES.LOGIN;
    if (saved && saved !== ROUTES.LOGIN) return saved;

    return ROUTES.DASHBOARD;
  });

  useEffect(() => {
    safeWriteLS(STORAGE_KEY, screen);
  }, [screen]);

  const [dashboardFilters, setDashboardFilters] = useState(() => loadDashboardFilters());

  useEffect(() => {
    const lot = normalizeLoteriaInput(dashboardFilters?.loteria);

    if (lot === "FEDERAL") {
      const h = String(dashboardFilters?.horario || "");
      if (h !== "Todos" && h !== "19h" && h !== "20h") {
        setDashboardFilters((prev) => ({ ...prev, horario: "Todos" }));
      } else if (dashboardFilters?.loteria !== "FEDERAL") {
        setDashboardFilters((prev) => ({ ...prev, loteria: "FEDERAL" }));
      }
      return;
    }

    if (dashboardFilters?.loteria !== lot) {
      setDashboardFilters((prev) => ({ ...prev, loteria: lot }));
    }
  }, [dashboardFilters?.loteria, dashboardFilters?.horario]);

  useEffect(() => {
    safeWriteLS(DASH_FILTERS_KEY, JSON.stringify(dashboardFilters));
  }, [dashboardFilters]);

  const logout = async () => {
    safeRemoveLS(STORAGE_KEY);
    safeRemoveLS(ACCOUNT_SESSION_KEY);
    safeRemoveLS(LS_GUEST_ACTIVE_KEY);
    safeRemoveLS(DASH_FILTERS_KEY);

    try {
      window.dispatchEvent(new Event("pp_session_changed"));
    } catch {}

    try {
      await signOut(auth);
    } catch {}

    setScreen(ROUTES.LOGIN);
    navigate("/login", { replace: true });
  };

  const forceGoDashboard = useRef(() => {
    cleanupLegacyGuestFlagIfNeeded();
    setScreen(ROUTES.DASHBOARD);
    safeWriteLS(STORAGE_KEY, ROUTES.DASHBOARD);
    navigate("/", { replace: true });
  }).current;

  useEffect(() => {
    if (adminMode) return;
    if (screen !== ROUTES.LOGIN) return;

    const goDashboard = () => {
      cleanupLegacyGuestFlagIfNeeded();
      setScreen(ROUTES.DASHBOARD);
      safeWriteLS(STORAGE_KEY, ROUTES.DASHBOARD);
      navigate("/", { replace: true });
    };

    const check = () => {
      const sess = loadSessionObj();

      if (sess) {
        goDashboard();
        return;
      }

      // se não há sessão formal, elimina guest legado
      cleanupLegacyGuestFlagIfNeeded();
    };

    check();

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) check();
    };

    const onSessionChanged = () => check();
    const onFocus = () => check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };

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
  }, [screen, adminMode, navigate]);

  useEffect(() => {
    if (adminMode) return;

    const syncFromSession = () => {
      cleanupLegacyGuestFlagIfNeeded();

      const sess = loadSessionObj();
      const kind = getSessionKind(sess);

      if (!sess) {
        if (screen !== ROUTES.LOGIN) setScreen(ROUTES.LOGIN);
        return;
      }

      if (kind === "guest" || kind === "user") {
        if (screen === ROUTES.LOGIN) {
          setScreen(ROUTES.DASHBOARD);
        }
      }
    };

    syncFromSession();

    const onStorage = (e) => {
      if (!e) return;
      if (e.key === ACCOUNT_SESSION_KEY || e.key === LS_GUEST_ACTIVE_KEY) {
        syncFromSession();
      }
    };

    const onSessionChanged = () => syncFromSession();

    window.addEventListener("storage", onStorage);
    window.addEventListener("pp_session_changed", onSessionChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pp_session_changed", onSessionChanged);
    };
  }, [adminMode, screen]);

  useEffect(() => {
    if (adminMode) return;

    if (!bootRef.current) {
      bootRef.current = true;
      setRouterBooted(true);
    }

    const wanted = pathToScreen(location?.pathname);
    if (!wanted) return;

    const sess = loadSessionObj();

    if (!sess) {
      if (screen !== ROUTES.LOGIN) setScreen(ROUTES.LOGIN);
      return;
    }

    if (wanted === ROUTES.LOGIN) {
      if (screen !== ROUTES.DASHBOARD) setScreen(ROUTES.DASHBOARD);
      return;
    }

    if (wanted !== screen) setScreen(wanted);
  }, [location?.pathname, adminMode, screen]);

  useEffect(() => {
    if (adminMode) return;
    if (!routerBooted) return;

    const path = screenToPath(screen);
    const cur = cleanPathname(location?.pathname);

    if (cur !== path) {
      navigate(path, { replace: true });
    }
  }, [screen, adminMode, routerBooted, location?.pathname, navigate]);

  const PageRouter = ({ s }) => {
    switch (s) {
      case ROUTES.ACCOUNT:
        return <Account onAuthenticated={forceGoDashboard} />;
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
        <BuildStamp />
      </ErrorBoundary>
    );
  }

  if (screen === ROUTES.LOGIN) {
    return (
      <ErrorBoundary>
        <Account
          onClose={() => {
            setScreen(ROUTES.LOGIN);
          }}
          onAuthenticated={forceGoDashboard}
        />
        <BuildStamp />
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
          <PageRouter s={screen} />
        )}
      </AppShell>
      <BuildStamp />
    </ErrorBoundary>
  );
}