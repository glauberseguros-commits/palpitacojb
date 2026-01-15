// src/pages/Dashboard/components/Sidebar/AppShell.jsx
import React, { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import MiniLogo from "./MiniLogo";

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

  // compat (mantém assinatura, mas não usamos)
  planLoading: _planLoading = false,
  isFree: _isFree = true,
  isTrial: _isTrial = false,
  isPremium: _isPremium = false,
}) {
  const [moreOpen, setMoreOpen] = useState(false);

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

          /* bottom bar (mobile) */
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
          border-radius: 12px; /* 🔻 antes 16 */
          background: rgba(0,0,0,0.45);
          padding: 10px;
          display: grid;
          place-items: center;
          box-shadow: 0 12px 30px rgba(0,0,0,0.55);
        }

        .pp_brandDot{
          width: 44px;
          height: 44px;
          border-radius: 12px; /* 🔻 antes 16 */
          border: 1px solid var(--pp_borderStrong);
          background: rgba(0,0,0,0.62);
          display: grid;
          place-items: center;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
        }

        .pp_nav{
          border: 1px solid var(--pp_border);
          border-radius: 12px; /* 🔻 antes 16 */
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
          border-radius: 12px; /* 🔻 antes 16 */
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
          border-radius: 10px; /* 🔻 antes 14 */
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

        /* =========================
           Mobile premium: Bottom Bar (FIXED)
        ========================= */
        @media (max-width: 820px){
          .pp_shell{
            grid-template-columns: 1fr;
          }

          .pp_sidebar{
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 50;

            height: calc(var(--pp_bottom_h) + env(safe-area-inset-bottom, 0px));
            border-right: none;
            border-top: 1px solid var(--pp_border);
            border-radius: 14px 14px 0 0; /* 🔻 antes 18 */

            padding: 10px 10px calc(12px + env(safe-area-inset-bottom, 0px));

            grid-template-rows: 1fr;
            grid-template-columns: 1fr;
          }

          .pp_brand{ display: none; }
          .pp_footer{ display: none; }

          .pp_nav{
            border-radius: 12px; /* 🔻 antes 16 */
            padding: 8px;

            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;

            overflow: hidden;
          }

          .pp_nav_item{
            width: 100%;
            height: 52px;
            border-radius: 12px; /* 🔻 antes 16 */
          }

          .pp_activePip{
            bottom: 7px;
          }

          .pp_main{
            padding-bottom: calc(var(--pp_bottom_h) + 12px + env(safe-area-inset-bottom, 0px));
          }
        }

        @media (min-width: 821px) and (max-width: 1080px){
          :root{ --pp_sidebar_w:78px; }
        }

        /* =========================
           Mobile "Mais" (Bottom Sheet)
        ========================= */
        .pp_moreOverlay{
          position: fixed;
          inset: 0;
          z-index: 80;
          background: rgba(0,0,0,0.62);
          backdrop-filter: blur(6px);
          display: grid;
          align-items: end;
        }

        .pp_moreSheet{
          border-top-left-radius: 14px;  /* 🔻 antes 18 */
          border-top-right-radius: 14px; /* 🔻 antes 18 */
          border: 1px solid rgba(255,255,255,0.10);
          border-bottom: none;
          background:
            radial-gradient(900px 260px at 20% 0%, rgba(201,168,62,0.10), transparent 55%),
            rgba(0,0,0,0.82);
          box-shadow: 0 -22px 60px rgba(0,0,0,0.70);
          padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
        }

        .pp_moreGrab{
          width: 54px;
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.18);
          margin: 2px auto 10px;
        }

        .pp_moreTitle{
          font-weight: 900;
          font-size: 13px;
          letter-spacing: 0.4px;
          color: rgba(255,255,255,0.86);
          margin: 0 0 10px;
          text-transform: uppercase;
          text-align: center;
        }

        .pp_moreGrid{
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .pp_moreBtn{
          border-radius: 12px; /* 🔻 antes 14 */
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.35);
          padding: 10px 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          box-shadow: 0 14px 34px rgba(0,0,0,0.45);
          color: inherit;
        }
        .pp_moreBtn:active{ transform: translateY(1px); }
        .pp_moreBtn .t{
          font-weight: 900;
          font-size: 12px;
          color: rgba(255,255,255,0.90);
          line-height: 1.1;
        }
        .pp_moreBtn .s{
          font-size: 10px;
          color: rgba(255,255,255,0.60);
          margin-top: 2px;
        }
        .pp_moreBtn .ic{
          width: 34px;
          height: 34px;
          border-radius: 12px; /* 🔻 antes 14 */
          border: 1px solid rgba(201,168,62,0.22);
          background: rgba(0,0,0,0.35);
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }

        .pp_moreDanger{
          border-color: rgba(255,90,90,0.22);
        }
      `,
    };
  }, []);

  const menuDesktop = [
    { key: ROUTES.ACCOUNT, title: "Minha Conta / Login", icon: "user" },
    { key: ROUTES.RESULTS, title: "Resultados", icon: "calendar" },
    { key: ROUTES.TOP3, title: "Top 3", icon: "trophy" },
    { key: ROUTES.LATE, title: "Atrasados", icon: "clock" },
    { key: ROUTES.SEARCH, title: "Busca / Lupa", icon: "search" },
    { key: ROUTES.CENTENAS, title: "Centenas (40)", icon: "hash" },
    { key: ROUTES.PAYMENTS, title: "Pagamentos", icon: "card" },
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
    { key: ROUTES.ACCOUNT, title: "Minha Conta / Login", icon: "user" },
    { key: ROUTES.TOP3, title: "Top 3", icon: "trophy" },
    { key: ROUTES.LATE, title: "Atrasados", icon: "clock" },
    { key: ROUTES.PAYMENTS, title: "Pagamentos", icon: "card" },
    { key: ROUTES.DOWNLOADS, title: "Baixar Resultados", icon: "download" },
    { key: "__LOGOUT__", title: "Sair", icon: "logout", danger: true },
  ];

  const handleNavigate = (routeKey) => {
    if (!routeKey) return;

    if (routeKey === "__MORE__") {
      setMoreOpen(true);
      return;
    }

    if (routeKey === "__LOGOUT__") {
      setMoreOpen(false);
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
          <div className="pp_moreTitle">Mais opções</div>

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
                    {it.key === "__LOGOUT__" ? "Encerrar sessão" : "Abrir"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pp_shell">
      <style>{ui.styleTag}</style>

      <aside className="pp_sidebar">
        <div className="pp_brand" title="Palpitaco">
          <div className="pp_brandDot" aria-hidden="true">
            <MiniLogo />
          </div>
        </div>

        <nav className="pp_nav" aria-label="Menu">
          {/* Desktop/tablet */}
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

          {/* Mobile bottom */}
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

          <NavButton
            title="Sair"
            icon="logout"
            isActive={false}
            onClick={() => onLogout?.()}
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
