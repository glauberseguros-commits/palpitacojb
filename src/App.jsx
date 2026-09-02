import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";


// ✅ Admin

// ✅ Páginas placeholder

// ✅ página de Centenas

// ✅ AppShell

// ✅ Firebase (Admin real / Auth real)
import { auth, db } from "./services/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { clearAccessRuntimeSession } from "./services/accessClient";
import {
  ACCESS_FLOW_STATE,
  bootstrapAuthorizedAccess,
  confirmDeviceAndAuthorize,
  closeAuthoritativeAccess,
} from "./services/accessFlow";

const Dashboard = lazy(() =>
  import("./pages/Dashboard/Dashboard")
);

const Account = lazy(() =>
  import("./pages/Account/Account")
);

const AccessGate = lazy(() =>
  import("./pages/Account/AccessGate")
);

const AppShell = lazy(() =>
  import("./pages/Dashboard/components/Sidebar/AppShell")
);

const Results = lazy(() => import("./pages/Results/Results"));
const Top3 = lazy(() => import("./pages/Top3/Top3"));
const TernoGrupo = lazy(() => import("./pages/TernoGrupo/TernoGrupo"));
const Late = lazy(() => import("./pages/Late/Late"));
const Search = lazy(() => import("./pages/Search/Search"));
const Admin = lazy(() => import("./pages/Admin/Admin"));
const AdminLogin = lazy(() => import("./pages/Admin/AdminLogin"));
const Payments = lazy(() => import("./pages/Payments/Payments"));
const Downloads = lazy(() => import("./pages/Downloads/Downloads"));
const Centenas = lazy(() => import("./pages/Centenas/Centenas"));
const Statistics = lazy(() => import("./pages/Statistics/Statistics"));


const STORAGE_KEY = "palpitaco_screen_v2";
const LEGACY_ACCOUNT_SESSION_KEY = "pp_session_v1";
const LEGACY_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

// ✅ Persistência de filtros do Dashboard
const DASH_FILTERS_KEY = "pp_dashboard_filters_v1";

const SELECTED_PRODUCT_KEY =
  "pp_selected_product_v1";

const PRODUCT_JB =
  "jb";

const PRODUCT_LOTERIAS =
  "loterias";

const PRODUCT_MILHAR_PRIME =
  "milhar-prime";

const PRODUCT_DESTINATIONS =
  Object.freeze({
    [PRODUCT_JB]:
      "/",

    [PRODUCT_LOTERIAS]:
      "/loterias/",

    [PRODUCT_MILHAR_PRIME]:
      "/palpitacomilharprime/",
  });


function normalizeSelectedProduct(
  value
) {
  const product =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();

  return Object.prototype
    .hasOwnProperty.call(
      PRODUCT_DESTINATIONS,
      product
    )
      ? product
      : "";
}


function productFromSearch(
  search
) {
  try {
    const params =
      new URLSearchParams(
        String(
          search || ""
        )
      );

    return normalizeSelectedProduct(
      params.get("product")
    );
  }
  catch {
    return "";
  }
}


function safeReadSelectedProduct() {
  try {
    return normalizeSelectedProduct(
      window.sessionStorage.getItem(
        SELECTED_PRODUCT_KEY
      )
    );
  }
  catch {
    return "";
  }
}


function safeWriteSelectedProduct(
  product
) {
  const normalized =
    normalizeSelectedProduct(
      product
    );

  if (!normalized) {
    return;
  }

  try {
    window.sessionStorage.setItem(
      SELECTED_PRODUCT_KEY,
      normalized
    );
  }
  catch {}
}


function productFlowPath(
  pathname,
  product
) {
  const normalized =
    normalizeSelectedProduct(
      product
    ) || PRODUCT_JB;

  return (
    pathname +
    "?product=" +
    encodeURIComponent(
      normalized
    )
  );
}


function redirectToSelectedProduct(
  product,
  navigate
) {
  const normalized =
    normalizeSelectedProduct(
      product
    ) || PRODUCT_JB;

  const destination =
    PRODUCT_DESTINATIONS[
      normalized
    ];

  safeWriteSelectedProduct(
    normalized
  );

  if (
    normalized ===
    PRODUCT_JB
  ) {
    navigate(
      "/",
      {
        replace: true,
      }
    );

    return;
  }

  window.location.replace(
    destination
  );
}

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
  TERNO_GRUPO: "terno-grupo",
  LATE: "late",
  SEARCH: "search",
  PAYMENTS: "payments",
  DOWNLOADS: "downloads",
  CENTENAS: "centenas",
  STATISTICS: "statistics",
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
   URL helpers
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
    case ROUTES.TERNO_GRUPO:
      return "/terno-grupo";
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
    case ROUTES.STATISTICS:
      return "/statistics";
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
  if (p === "/terno-grupo") return ROUTES.TERNO_GRUPO;
  if (p === "/late") return ROUTES.LATE;
  if (p === "/search") return ROUTES.SEARCH;
  if (p === "/payments") return ROUTES.PAYMENTS;
  if (p === "/downloads") return ROUTES.DOWNLOADS;
  if (p === "/centenas") return ROUTES.CENTENAS;
  if (p === "/statistics") return ROUTES.STATISTICS;

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


function AppLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "rgba(255,255,255,0.85)",
        display: "grid",
        placeItems: "center",
        padding: 18,
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      Carregando...
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const queryProduct =
    useMemo(
      () =>
        productFromSearch(
          location?.search
        ),
      [
        location?.search,
      ]
    );

  const selectedProduct =
    queryProduct ||
    safeReadSelectedProduct() ||
    PRODUCT_JB;

  useEffect(
    () => {
      if (queryProduct) {
        safeWriteSelectedProduct(
          queryProduct
        );
      }
    },
    [
      queryProduct,
    ]
  );

  useEffect(() => {
    console.log("[PALPITACO BUILD]", {
      sha: BUILD_SHA || "(none)",
      ref: BUILD_REF || "(none)",
      time: BUILD_TIME || "(none)",
      href: typeof window !== "undefined" ? window.location.href : "",
    });
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

  const [dashboardFilters, setDashboardFilters] = useState(() => loadDashboardFilters());

  const [userAuthReady, setUserAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [accessResult, setAccessResult] = useState(null);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState("");

  const accessRunRef = useRef(0);

  function clearLegacyAccessMarkers() {
    safeRemoveLS(LEGACY_ACCOUNT_SESSION_KEY);
    safeRemoveLS(LEGACY_GUEST_ACTIVE_KEY);

    try {
      window.dispatchEvent(new Event("pp_session_changed"));
    } catch {}
  }

  async function resolveAuthoritativeAccess(user = auth.currentUser) {
    const runId = accessRunRef.current + 1;
    accessRunRef.current = runId;

    if (!user?.uid || user?.isAnonymous === true) {
      clearAccessRuntimeSession();
      clearLegacyAccessMarkers();

      setFirebaseUser(null);
      setAccessResult(null);
      setAccessBusy(false);
      setAccessError("");

      return null;
    }

    setFirebaseUser(user);
    setAccessBusy(true);
    setAccessError("");

    try {
      const result =
        await bootstrapAuthorizedAccess();

      if (accessRunRef.current !== runId) {
        return null;
      }

      clearLegacyAccessMarkers();
      setAccessResult(result || null);

      return result || null;
    } catch (error) {
      if (accessRunRef.current !== runId) {
        return null;
      }

      clearAccessRuntimeSession();
      clearLegacyAccessMarkers();
      setAccessResult(null);

      setAccessError(
        String(
          error?.message ||
            error?.code ||
            "Não foi possível validar seu acesso."
        ).trim()
      );

      return null;
    } finally {
      if (accessRunRef.current === runId) {
        setAccessBusy(false);
      }
    }
  }

  useEffect(() => {
    let alive = true;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!alive) return;

      setUserAuthReady(true);

      if (adminMode) {
        setFirebaseUser(user?.uid ? user : null);
        return;
      }

      if (user?.isAnonymous === true) {
        clearAccessRuntimeSession();
        clearLegacyAccessMarkers();

        setFirebaseUser(null);
        setAccessResult(null);
        setAccessError("");
        setAccessBusy(false);

        try {
          await signOut(auth);
        } catch {}

        return;
      }

      setFirebaseUser(user?.uid ? user : null);

      await resolveAuthoritativeAccess(user);
    });

    return () => {
      alive = false;
      accessRunRef.current += 1;
      unsub?.();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminMode]);

  async function refreshAuthoritativeAccess() {
    return resolveAuthoritativeAccess(auth.currentUser);
  }

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



  const currentScreen = useMemo(() => {
    const byPath = pathToScreen(location?.pathname);
    if (byPath) return byPath;

    const saved = normalizeRoute(safeReadLS(STORAGE_KEY));
    if (saved && saved !== ROUTES.LOGIN) return saved;

    return accessResult?.state === ACCESS_FLOW_STATE.AUTHORIZED
      ? ROUTES.DASHBOARD
      : ROUTES.LOGIN;
  }, [location?.pathname, accessResult?.state]);

  useEffect(() => {
    if (adminMode) return;
    if (!userAuthReady) return;

    const pathScreen =
      pathToScreen(location?.pathname);

    const curPath =
      cleanPathname(location?.pathname);

    if (!firebaseUser?.uid) {
      const expectedSearch =
        "?product=" +
        encodeURIComponent(
          selectedProduct
        );

      if (
        curPath !== "/login" ||
        String(
          location?.search || ""
        ) !== expectedSearch
      ) {
        navigate(
          productFlowPath(
            "/login",
            selectedProduct
          ),
          {
            replace: true,
          }
        );
      }

      return;
    }

    if (accessBusy && !accessResult) {
      return;
    }

    const phase =
      accessResult?.state || "";

    if (
      phase ===
      ACCESS_FLOW_STATE.SUBSCRIPTION_REQUIRED
    ) {
      const expectedSearch =
        "?product=" +
        encodeURIComponent(
          selectedProduct
        );

      if (
        curPath !== "/payments" ||
        String(
          location?.search || ""
        ) !== expectedSearch
      ) {
        navigate(
          productFlowPath(
            "/payments",
            selectedProduct
          ),
          {
            replace: true,
          }
        );
      }

      return;
    }

    if (
      phase ===
      ACCESS_FLOW_STATE.DEVICE_CONFIRMATION_REQUIRED
    ) {
      const expectedSearch =
        "?product=" +
        encodeURIComponent(
          selectedProduct
        );

      if (
        curPath !== "/login" ||
        String(
          location?.search || ""
        ) !== expectedSearch
      ) {
        navigate(
          productFlowPath(
            "/login",
            selectedProduct
          ),
          {
            replace: true,
          }
        );
      }

      return;
    }

    if (
      phase !==
      ACCESS_FLOW_STATE.AUTHORIZED
    ) {
      return;
    }

    if (
      curPath === "/login" ||
      curPath === "/payments"
    ) {
      redirectToSelectedProduct(
        selectedProduct,
        navigate
      );

      return;
    }

    if (!pathScreen) {
      const saved =
        normalizeRoute(
          safeReadLS(STORAGE_KEY)
        );

      navigate(
        screenToPath(
          saved && saved !== ROUTES.LOGIN
            ? saved
            : ROUTES.DASHBOARD
        ),
        { replace: true }
      );
    }
  }, [
    adminMode,
    userAuthReady,
    firebaseUser?.uid,
    accessBusy,
    accessResult,
    location?.pathname,
    location?.search,
    selectedProduct,
    navigate,
  ]);

  useEffect(() => {
    if (adminMode) return;
    if (currentScreen && currentScreen !== ROUTES.LOGIN) {
      safeWriteLS(STORAGE_KEY, currentScreen);
    }
  }, [adminMode, currentScreen]);

  const goToScreen = (nextScreen) => {
    const path = screenToPath(nextScreen);
    const cur = cleanPathname(location?.pathname);
    if (cur !== path) {
      navigate(path);
    }
  };

  const logout = async () => {
    safeRemoveLS(STORAGE_KEY);
    safeRemoveLS(DASH_FILTERS_KEY);

    try {
      await closeAuthoritativeAccess();
    } catch {
      clearAccessRuntimeSession();
    }

    clearLegacyAccessMarkers();

    accessRunRef.current += 1;

    setAccessResult(null);
    setAccessError("");
    setAccessBusy(false);
    setFirebaseUser(null);

    try {
      await signOut(auth);
    } catch {}

    navigate(
      productFlowPath(
        "/login",
        selectedProduct
      ),
      {
        replace: true,
      }
    );
  };

  const handleAuthenticated = () => {
    clearLegacyAccessMarkers();
  };

  const handleDeviceConfirmation = async (code) => {
    const challengeToken =
      String(
        accessResult?.challengeToken ||
          accessResult?.challenge?.challengeToken ||
          ""
      ).trim();

    if (!challengeToken) {
      setAccessError(
        "Não foi possível localizar o desafio de confirmação."
      );
      return false;
    }

    setAccessBusy(true);
    setAccessError("");

    try {
      const result =
        await confirmDeviceAndAuthorize({
          challengeToken,
          code,
        });

      clearLegacyAccessMarkers();
      setAccessResult(result);

      safeWriteLS(
        STORAGE_KEY,
        ROUTES.DASHBOARD
      );

      redirectToSelectedProduct(
        selectedProduct,
        navigate
      );

      return true;
    } catch (error) {
      setAccessError(
        String(
          error?.message ||
            error?.code ||
            "Não foi possível confirmar este dispositivo."
        ).trim()
      );

      return false;
    } finally {
      setAccessBusy(false);
    }
  };

  const handleAccessRetry = async () => {
    setAccessError("");
    await refreshAuthoritativeAccess();
  };

  const renderScreen = (s) => {
    switch (s) {
      case ROUTES.ACCOUNT:
        return <Account onAuthenticated={() => {}} />;
      case ROUTES.RESULTS:
        return <Results />;
      case ROUTES.TOP3:
        return <Top3 />;
      case ROUTES.TERNO_GRUPO:
        return <TernoGrupo />;
      case ROUTES.LATE:
        return <Late />;
      case ROUTES.SEARCH:
        return <Search />;
      case ROUTES.CENTENAS:
        return <Centenas />;
      case ROUTES.STATISTICS:
        return <Statistics />;
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
        <Suspense fallback={<AppLoading />}>
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
              </Suspense>
      </ErrorBoundary>
    );
  }

  if (
    !userAuthReady ||
    (
      firebaseUser?.uid &&
      accessBusy &&
      !accessResult &&
      !accessError
    )
  ) {
    return <AppLoading />;
  }

  if (!firebaseUser?.uid) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AppLoading />}>
          <Account
            onClose={() => {}}
            onAuthenticated={handleAuthenticated}
          />
          <BuildStamp />
        </Suspense>
      </ErrorBoundary>
    );
  }

  const authoritativePhase =
    accessResult?.state || "";

  if (
    authoritativePhase ===
    ACCESS_FLOW_STATE.SUBSCRIPTION_REQUIRED
  ) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AppLoading />}>
          <AccessGate
            mode="subscription"
            email={firebaseUser?.email || ""}
            busy={accessBusy}
            error={accessError}
            onRetry={handleAccessRetry}
            onLogout={logout}
          />
          <BuildStamp />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (
    authoritativePhase ===
    ACCESS_FLOW_STATE.DEVICE_CONFIRMATION_REQUIRED
  ) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AppLoading />}>
          <AccessGate
            mode="device"
            email={
              accessResult?.user?.email ||
              firebaseUser?.email ||
              ""
            }
            slot={accessResult?.slot || ""}
            busy={accessBusy}
            error={accessError}
            onConfirmCode={handleDeviceConfirmation}
            onRetry={handleAccessRetry}
            onLogout={logout}
          />
          <BuildStamp />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (
    authoritativePhase !==
    ACCESS_FLOW_STATE.AUTHORIZED
  ) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<AppLoading />}>
          <AccessGate
            mode="error"
            email={firebaseUser?.email || ""}
            busy={accessBusy}
            error={
              accessError ||
              "Não foi possível validar seu acesso."
            }
            onRetry={handleAccessRetry}
            onLogout={logout}
          />
          <BuildStamp />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
        <Suspense fallback={<AppLoading />}>
      <AppShell active={currentScreen} onNavigate={goToScreen} onLogout={logout}>
        {currentScreen === ROUTES.DASHBOARD ? (
          <Dashboard
            filters={{
              ...dashboardFilters,
              lotteryKey: loteriaToLotteryKey(dashboardFilters?.loteria),
            }}
            setFilters={setDashboardFilters}
          />
        ) : (
          renderScreen(currentScreen)
        )}
      </AppShell>
      <BuildStamp />
            </Suspense>
      </ErrorBoundary>
  );
}
