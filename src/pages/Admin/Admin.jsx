import React, { useMemo, useState } from "react";
import "./Admin.css";
import MilharEnginePage from "./modules/MilharEngine/MilharEnginePage";

const SECTIONS = [
  {
    key: "dashboard",
    short: "DT",
    title: "Dashboard Técnico",
    description: "Visão geral da infraestrutura interna.",
  },
  {
    key: "milhar-engine",
    short: "MI",
    title: "Motor de Milhares",
    description: "Auditoria interna do motor probabilístico.",
  },
  {
    key: "audits",
    short: "AU",
    title: "Auditorias",
    description: "Inspeções de integridade e consistência.",
  },
  {
    key: "backtests",
    short: "BT",
    title: "Backtests",
    description: "Validação histórica dos motores.",
  },
  {
    key: "logs",
    short: "LG",
    title: "Logs",
    description: "Registros técnicos e diagnósticos.",
  },
  {
    key: "settings",
    short: "CF",
    title: "Configurações",
    description: "Parâmetros internos do ambiente.",
  },
];

function StatusPill({ children, tone = "neutral" }) {
  return (
    <span className={`admin-status admin-status--${tone}`}>
      <span className="admin-status__dot" />
      {children}
    </span>
  );
}

function DashboardTechnical() {
  const cards = [
    {
      label: "Motor de Milhares",
      value: "MILHAR_PROBABILITY_V2",
      status: "Ativo",
      tone: "success",
    },
    {
      label: "Motor TOP3",
      value: "V3_STATISTICAL",
      status: "Ativo",
      tone: "success",
    },
    {
      label: "Score Engine",
      value: "Motor de ranking",
      status: "Ativo",
      tone: "success",
    },
    {
      label: "Integridade da Base",
      value: "Auditoria pendente",
      status: "A auditar",
      tone: "warning",
    },
  ];

  return (
    <>
      <section className="admin-hero">
        <div>
          <div className="admin-eyebrow">PALPITACO JB · ÁREA INTERNA</div>
          <h1>Engine Center</h1>
          <p>
            Ambiente restrito para acompanhamento técnico, auditorias e
            evolução dos motores da plataforma.
          </p>
        </div>

        <StatusPill tone="success">Ambiente operacional</StatusPill>
      </section>

      <section className="admin-card-grid" aria-label="Status dos motores">
        {cards.map((card) => (
          <article className="admin-engine-card" key={card.label}>
            <div className="admin-engine-card__top">
              <span className="admin-engine-card__label">{card.label}</span>
              <StatusPill tone={card.tone}>{card.status}</StatusPill>
            </div>

            <strong className="admin-engine-card__value">{card.value}</strong>

            <div className="admin-engine-card__footer">
              Detalhamento técnico será conectado em uma etapa posterior.
            </div>
          </article>
        ))}
      </section>

      <section className="admin-panel">
        <div className="admin-panel__header">
          <div>
            <span className="admin-panel__eyebrow">ESTRUTURA INICIAL</span>
            <h2>Centro técnico preparado</h2>
          </div>
        </div>

        <div className="admin-panel__body">
          <p>
            Esta primeira entrega estabelece somente o layout e a navegação
            interna. Backtests, métricas, logs e auditorias reais ainda não
            estão conectados.
          </p>
        </div>
      </section>
    </>
  );
}

function PlaceholderSection({ section }) {
  return (
    <section className="admin-panel admin-panel--placeholder">
      <div className="admin-placeholder-icon">{section.short}</div>

      <div>
        <div className="admin-eyebrow">MÓDULO INTERNO</div>
        <h1>{section.title}</h1>
        <p>{section.description}</p>

        <div className="admin-placeholder-note">
          Estrutura preparada. Os dados reais serão conectados nas próximas
          etapas.
        </div>
      </div>
    </section>
  );
}

export default function Admin({ onExit, onLogout }) {
  const [active, setActive] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  const activeSection = useMemo(
    () => SECTIONS.find((item) => item.key === active) || SECTIONS[0],
    [active]
  );

  const handleNavigate = (key) => {
    setActive(key);
    setMenuOpen(false);
  };

  return (
    <div className="admin-shell">
      <div
        className={`admin-overlay ${menuOpen ? "admin-overlay--open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`admin-sidebar ${menuOpen ? "admin-sidebar--open" : ""}`}
        aria-label="Navegação administrativa"
      >
        <div className="admin-brand">
          <div className="admin-brand__mark">PB</div>

          <div>
            <strong>Palpitaco JB</strong>
            <span>Engine Center</span>
          </div>
        </div>

        <div className="admin-access-badge">ACESSO RESTRITO</div>

        <nav className="admin-nav">
          {SECTIONS.map((item) => {
            const isActive = active === item.key;

            return (
              <button
                key={item.key}
                type="button"
                className={`admin-nav-item ${
                  isActive ? "admin-nav-item--active" : ""
                }`}
                onClick={() => handleNavigate(item.key)}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="admin-nav-item__icon">{item.short}</span>

                <span className="admin-nav-item__content">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="admin-sidebar__footer">
          <button
            type="button"
            className="admin-secondary-button"
            onClick={() => onExit?.()}
          >
            Voltar à plataforma
          </button>

          <button
            type="button"
            className="admin-danger-button"
            onClick={() => onLogout?.()}
          >
            Sair do Admin
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button
            type="button"
            className="admin-menu-button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu administrativo"
          >
            <span />
            <span />
            <span />
          </button>

          <div className="admin-topbar__title">
            <span>ADMIN</span>
            <strong>{activeSection.title}</strong>
          </div>

          <StatusPill tone="success">Autenticado</StatusPill>
        </header>

        <div className="admin-content">
          {active === "dashboard" ? (
            <DashboardTechnical />
          ) : active === "milhar-engine" ? (
            <MilharEnginePage />
          ) : (
            <PlaceholderSection section={activeSection} />
          )}
        </div>
      </main>
    </div>
  );
}
