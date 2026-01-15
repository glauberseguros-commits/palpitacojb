// src/pages/Dashboard/components/Sidebar/AppShell.jsx
import React, { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import MiniLogo from "./MiniLogo";

// ✅ Sync com Firebase Auth
import { auth } from "../../../services/firebase";
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

function safeReadLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLS(key, val) {
  try {
    localStorage.setItem(key, val);
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

/**
 * ✅ Normaliza a sessão (guest/user/plan)
 * Contrato aceito:
 * - string legacy -> { ok:true, type:"user", plan:"FREE" }
 * - json -> { ok:true, type:"guest"|"user", plan:"FREE"|"PRO"|"VIP", ... }
 */
function readSession() {
  const raw = safeReadLS(ACCOUNT_SESSION_KEY);
  if (!raw) return { ok: false, type: "none", plan: "FREE" };

  const s = String(raw).trim();
  if (!s) return { ok: false, type: "none", plan: "FREE" };

  if (s.startsWith("{")) {
    const obj = safeParseJson(s);
    if (!obj || typeof obj !== "object") return { ok: false, type: "none", plan: "FREE" };

    const ok = obj.ok === true;
    const type = String(obj.type || "").trim().toLowerCase();
    const plan = String(obj.plan || "").trim().toUpperCase();

    const normType = type === "guest" ? "guest" : type === "user" ? "user" : "user";
    const normPlan = plan === "VIP" ? "VIP" : plan === "PRO" ? "PRO" : "FREE";

    return { ok, type: normType, plan: normPlan, raw: obj };
  }

  // fallback legacy (qualquer valor != vazio)
  return { ok: true, type: "user", plan: "FREE" };
}

function writeSession(obj) {
  safeWriteLS(ACCOUNT_SESSION_KEY, JSON.stringify(obj));
  // avisa o próprio tab (storage não dispara no mesmo tab)
  window.dispatchEvent(new Event("pp_session_changed"));
}

function readGuestActive() {
  try {
    return localStorage.getItem(LS_GUEST_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function MoreDotsIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", opacity: 0.92 }}
    >
      <circle cx="6" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="18" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export default function AppShell({
  active,
  onNavigate,
  onLogout,
  children,
  planLoading: _planLoading = false,
  isFree: _isFree = true,
  isTrial: _isTrial = false,
  isPremium: _isPremium = false,
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // ✅ sessão REATIVA (não congela)
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

  // ✅ Sync com Firebase Auth:
  // - se tem user => força session type:"user"
  // - se não tem user => se guestActive => session guest
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid) {
        writeSession({ ok: true, type: "user", plan: "FREE", uid: user.uid });
        setSession(readSession());
        return;
      }

      // sem user: se guest ativo, vira guest; senão limpa
      if (readGuestActive()) {
        writeSession({ ok: true, type: "guest", plan: "FREE" });
        setSession(readSession());
      } else {
        safeRemoveLS(ACCOUNT_SESSION_KEY);
        window.dispatchEvent(new Event("pp_session_changed"));
        setSession(readSession());
      }
    });

    return () => unsub?.();
  }, []);

  const isGuest = !!session?.ok && session?.type === "guest";
  const plan = String(session?.plan || "FREE").toUpperCase();
  const isPro = plan === "PRO" || plan === "VIP";
  const isVip = plan === "VIP";

  const ui = useMemo(() => {
    const BORDER = "rgba(255,255,255,0.12)";
    const BORDER2 = "rgba(255,255,255,0.08)";
    const GOLD = "rgba(201,168,62,0.92)";

    const btnReset = {
      appearance: "none",
      border: "none",
      background: "transparent",
      padding: 0,
      margin: 0,
      font: "inherit",
      color: "inherit",
      textAlign: "inherit",
      width: "100%",
      cursor: "pointer",
    };

    return {
      btnReset,
      styleTag: `
        :root{
          --pp_bg:#050505;
          --pp_text:rgba(255,255,255,0.94);
          --pp_border:${BORDER2};
          --pp_borderStrong:${BORDER};
          --pp_gold:${GOLD};
          --pp_sidebar_w:86px;
          --pp_sidebar_pad:10px;
          --pp_bottom_h:74px;
        }

        .pp_shell{
          height: 100dvh;
          min-height: 100vh;
          background: var(--pp_bg);
          color: var(--pp_text);
          display: grid;
          grid-template-columns: var(--pp_sidebar_w) 1fr;
          overflow: hidden;
        }

        .pp_sidebar{
          border-right: 1px solid var(--pp_border);
          background:
            radial-gradient(420px 220px at 40% 10%, rgba(201,168,62,0.10) 0%, rgba(0,0,0,0) 55%),
            rgba(0,0,0,0.68);
          padding: var(--pp_sidebar_pad);
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 10px;
          min-width: 0;
        }

        .pp_brand{
          border: 1px solid var(--pp_border);
          border-radius: 12px;
          background: rgba(0,0,0,0.45);
          padding: 10px;
          display: grid;
          place-items: center;
          box-shadow: 0 12px 30px rgba(0,0,0,0.55);
          position: relative;
          overflow: hidden;
        }

        .pp_brandDot{
          width: 44px;
          height: 44px;
          border-radius: 12px;
          border: 1px solid var(--pp_borderStrong);
          background: rgba(0,0,0,0.62);
          display: grid;
          place-items: center;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
        }

        .pp_planPill{
          margin-top: 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.40);
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: 0.35px;
          color: rgba(255,255,255,0.82);
          text-transform: uppercase;
        }

        .pp_planPill.isGold{
          border-color: rgba(201,168,62,0.38);
          background: rgba(201,168,62,0.14);
          color: rgba(201,168,62,0.98);
        }

        .pp_nav{
          border: 1px solid var(--pp_border);
          border-radius: 12px;
          background: rgba(0,0,0,0.38);
          padding: 10px;
          display: grid;
          gap: 8px;
          align-content: start;
          overflow: auto;
          scrollbar-gutter: stable;
          -webkit-overflow-scrolling: touch;
        }

        .pp_footer{
          border: 1px solid var(--pp_border);
          border-radius: 12px;
          background: rgba(0,0,0,0.38);
          padding: 10px;
          display: grid;
          gap: 8px;
        }

        .pp_main{
          min-width: 0;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
        }

        .pp_nav_item{
          height: 46px;
          border-radius: 10px;
          border: 1px solid var(--pp_border);
          background: rgba(0,0,0,0.20);
          display: grid;
          place-items: center;
          position: relative;
          transition: transform .08s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease;
        }

        .pp_nav_item.isActive{
          border-color: rgba(201,168,62,0.35);
          background: linear-gradient(180deg, rgba(201,168,62,0.18), rgba(0,0,0,0.25));
          box-shadow: 0 10px 22px rgba(0,0,0,0.45);
        }

        .pp_nav_icon{ opacity: 0.92; }
        .pp_nav_item:hover .pp_nav_icon{ opacity: 1; }
        .pp_nav_item:active{ transform: translateY(1px); }
        .pp_nav_item:focus-visible{
          outline: none;
          box-shadow: 0 0 0 3px rgba(201,168,62,0.16);
        }

        .pp_activePip{
          position: absolute;
          left: 50%;
          bottom: 6px;
          transform: translateX(-50%);
          width: 22px;
          height: 6px;
          border-radius: 999px;
          background: var(--pp_gold);
          box-shadow: 0 0 0 3px rgba(201,168,62,0.10);
        }

        @media (max-width: 820px){
          .pp_shell{ grid-template-columns: 1fr; }

          .pp_sidebar{
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 50;
            height: calc(var(--pp_bottom_h) + env(safe-area-inset-bottom, 0px));
            border-right: none;
            border-top: 1px solid var(--pp_border);
            border-radius: 14px 14px 0 0;
            padding: 10px 10px calc(12px + env(safe-area-inset-bottom, 0px));
            grid-template-rows: 1fr;
            grid-template-columns: 1fr;
          }

          .pp_brand{ display: none; }
          .pp_footer{ display: none; }

          .pp_nav{
            border-radius: 12px;
            padding: 8px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            overflow: hidden;
          }

          .pp_nav_item{
            width: 100%;
            height: 52px;
            border-radius: 12px;
          }

          .pp_activePip{ bottom: 7px; }

          .pp_main{
            padding-bottom: calc(var(--pp_bottom_h) + 12px + env(safe-area-inset-bottom, 0px));
          }
        }

        @media (min-width: 821px) and (max-width: 1080px){
          :root{ --pp_sidebar_w:78px; }
        }
      `,
    };
  }, []);

  const accountTitle = isGuest ? "Entrar / Minha Conta" : "Minha Conta";
  const logoutTitle = isGuest ? "Sair do Preview" : "Sair";

  const menuDesktop = [
    { key: ROUTES.ACCOUNT, title: accountTitle, icon: "user" },
    { key: ROUTES.RESULTS, title: "Resultados", icon: "calendar" },
    { key: ROUTES.TOP3, title: "Top 3", icon: "trophy" },
    { key: ROUTES.LATE, title: "Atrasados", icon: "clock" },
    { key: ROUTES.SEARCH, title: "Busca / Lupa", icon: "search" },
    { key: ROUTES.CENTENAS, title: "Centenas (40)", icon: "hash" },
    { key: ROUTES.PAYMENTS, title: "Planos / Pagamentos", icon: "card" },
    { key: ROUTES.DOWNLOADS, title: "Baixar Resultados", icon: "download" },
  ];

  const menuMobileBottom = [
    { key: ROUTES.DASHBOARD, title: "Dashboard", icon: "home" },
    { key: ROUTES.RESULTS, title: "Resultados", icon: "calendar" },
    { key: ROUTES.SEARCH, title: "Busca", icon: "search" },
    { key: ROUTES.CENTENAS, title: "Centenas", icon: "hash" },
    { key: "__MORE__", title: "Mais", icon: "__MORE_DOTS__" },
  ];

  const menuMore = [
    ...(isGuest
      ? [
          { key: ROUTES.PAYMENTS, title: "Ver planos (PRO/VIP)", icon: "card" },
          { key: ROUTES.ACCOUNT, title: "Entrar / Minha Conta", icon: "user" },
        ]
      : [{ key: ROUTES.ACCOUNT, title: "Minha Conta", icon: "user" }]),
    { key: ROUTES.TOP3, title: "Top 3", icon: "trophy" },
    { key: ROUTES.LATE, title: "Atrasados", icon: "clock" },
    ...(isGuest ? [] : [{ key: ROUTES.PAYMENTS, title: "Pagamentos", icon: "card" }]),
    { key: ROUTES.DOWNLOADS, title: "Baixar Resultados", icon: "download" },
    { key: "__LOGOUT__", title: logoutTitle, icon: "logout", danger: true },
  ];

  const handleNavigate = async (routeKey) => {
    if (!routeKey) return;

    if (routeKey === "__MORE__") {
      setMoreOpen(true);
      return;
    }

    if (routeKey === "__LOGOUT__") {
      setMoreOpen(false);

      // ✅ logout real do Firebase
      try {
        await signOut(auth);
      } catch {}

      // ✅ limpa sessão local
      safeRemoveLS(ACCOUNT_SESSION_KEY);
      safeRemoveLS(LS_GUEST_ACTIVE_KEY);
      window.dispatchEvent(new Event("pp_session_changed"));

      onLogout?.();
      return;
    }

    setMoreOpen(false);
    onNavigate?.(routeKey);
  };

  useEffect(() => {
    setMoreOpen(false);
  }, [active]);

  useEffect(() => {
    if (!moreOpen) return;

    const onKey = (e) => {
      if (e.key === "Escape") setMoreOpen(false);
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [moreOpen]);

  const NavButton = ({ title, isActive, onClick, icon }) => {
    const isMore = icon === "__MORE_DOTS__";

    return (
      <button
        type="button"
        className={`pp_nav_item ${isActive ? "isActive" : ""}`}
        style={ui.btnReset}
        title={title}
        aria-label={title}
        aria-current={isActive ? "page" : undefined}
        onClick={onClick}
      >
        <span className="pp_nav_icon" aria-hidden="true">
          {isMore ? <MoreDotsIcon /> : <Icon name={icon} />}
        </span>
        {isActive ? <span className="pp_activePip" /> : null}
      </button>
    );
  };

  const MoreSheet = () => {
    if (!moreOpen) return null;

    const stop = (e) => e.stopPropagation();

    return (
      <div
        className="pp_moreOverlay"
        role="dialog"
        aria-modal="true"
        aria-label="Mais opções"
        onClick={() => setMoreOpen(false)}
      >
        <div className="pp_moreSheet" onClick={stop}>
          <div className="pp_moreGrab" aria-hidden="true" />
          <div className="pp_moreTitle">{isGuest ? "Modo Preview" : "Mais opções"}</div>

          <div className="pp_moreGrid">
            {menuMore.map((it) => (
              <button
                key={it.key}
                type="button"
                className={`pp_moreBtn ${it.danger ? "pp_moreDanger" : ""}`}
                onClick={() => handleNavigate(it.key)}
                title={it.title}
              >
                <span className="ic" aria-hidden="true">
                  <Icon name={it.icon} />
                </span>
                <span style={{ display: "flex", flexDirection: "column" }}>
                  <span className="t">{it.title}</span>
                  <span className="s">
                    {it.key === "__LOGOUT__"
                      ? "Encerrar sessão"
                      : it.key === ROUTES.PAYMENTS
                      ? "Comparar planos"
                      : "Abrir"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const planLabel = useMemo(() => {
    if (isGuest) return "PREVIEW";
    if (isVip) return "VIP";
    if (isPro) return "PRO";
    return "FREE";
  }, [isGuest, isVip, isPro]);

  return (
    <div className="pp_shell">
      <style>{ui.styleTag}</style>

      <aside className="pp_sidebar">
        <div className="pp_brand" title="Palpitaco">
          <div className="pp_brandDot" aria-hidden="true">
            <MiniLogo />
          </div>
          <div className={`pp_planPill ${planLabel !== "FREE" ? "isGold" : ""}`}>{planLabel}</div>
        </div>

        <nav className="pp_nav" aria-label="Menu">
          <div className="pp_desktopNav" style={{ display: "contents" }}>
            <NavButton
              title="Dashboard"
              icon="home"
              isActive={active === ROUTES.DASHBOARD}
              onClick={() => handleNavigate(ROUTES.DASHBOARD)}
            />

            {menuDesktop.map((it) => (
              <NavButton
                key={it.key}
                title={it.title}
                icon={it.icon}
                isActive={active === it.key}
                onClick={() => handleNavigate(it.key)}
              />
            ))}
          </div>

          <div className="pp_mobileNav" style={{ display: "none" }}>
            {menuMobileBottom.map((it) => (
              <NavButton
                key={it.key}
                title={it.title}
                icon={it.icon}
                isActive={it.key === "__MORE__" ? moreOpen : active === it.key}
                onClick={() => handleNavigate(it.key)}
              />
            ))}
          </div>
        </nav>

        <div className="pp_footer">
          <NavButton
            title="Voltar ao Dashboard"
            icon="back"
            isActive={false}
            onClick={() => handleNavigate(ROUTES.DASHBOARD)}
          />

          {isGuest ? (
            <NavButton
              title="Ver planos (PRO/VIP)"
              icon="card"
              isActive={false}
              onClick={() => handleNavigate(ROUTES.PAYMENTS)}
            />
          ) : null}

          <NavButton
            title={logoutTitle}
            icon="logout"
            isActive={false}
            onClick={() => handleNavigate("__LOGOUT__")}
          />
        </div>
      </aside>

      <main className="pp_main">{children}</main>

      <MoreSheet />

      <style>{`
        @media (max-width: 820px){
          .pp_desktopNav{ display:none !important; }
          .pp_mobileNav{ display:contents !important; }
        }
        @media (min-width: 821px){
          .pp_desktopNav{ display:contents !important; }
          .pp_mobileNav{ display:none !important; }
        }
      `}</style>
    </div>
  );
}
