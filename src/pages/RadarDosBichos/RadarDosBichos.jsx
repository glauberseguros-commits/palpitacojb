import React, { useMemo, useState } from "react";
import { getScheduleByLottery } from "../../constants/schedule";

import { LOTTERY_CATALOG_DISPLAY_GLOBAL } from "../../constants/lotteryCatalog";
/*
 * RADAR_DOS_BICHOS_SHELL_V1
 *
 * Esta página cria SOMENTE a estrutura funcional/visual:
 *
 * LOTERIAS
 * CALENDÁRIO
 * TOP3
 * HISTÓRICO
 *
 * Não existe cálculo preditivo nesta etapa.
 * Não reutiliza o motor TOP3 existente.
 * Não cria palpites.
 */

const LOTTERIES =
  LOTTERY_CATALOG_DISPLAY_GLOBAL;

const TABS = Object.freeze([
  {
    key: "lotteries",
    label: "LOTERIAS",
  },
  {
    key: "calendar",
    label: "CALENDÁRIO",
  },
  {
    key: "top3",
    label: "TOP3",
  },
  {
    key: "history",
    label: "HISTÓRICO",
  },
]);

function hourLabel(hour) {
  const value =
    String(hour || "").trim();

  if (!value) {
    return "";
  }

  return value;
}

export default function RadarDosBichos() {
  const [activeTab, setActiveTab] =
    useState("lotteries");

  const [lotteryKey, setLotteryKey] =
    useState("PT_RIO");

  const selectedLottery =
    useMemo(
      () =>
        LOTTERIES.find(
          (item) =>
            item.key ===
            lotteryKey
        ) ||
        LOTTERIES[0],
      [lotteryKey]
    );

  const schedule =
    useMemo(
      () =>
        getScheduleByLottery(
          lotteryKey
        ),
      [lotteryKey]
    );

  const ui = {
    page: {
      width: "100%",
      minHeight: "100%",
      padding:
        "clamp(18px, 3vw, 34px)",
      boxSizing: "border-box",
      color:
        "rgba(255,255,255,0.94)",
      background:
        "radial-gradient(circle at 50% 0%, rgba(202,166,75,0.10), transparent 32%), #050505",
    },

    inner: {
      width: "100%",
      maxWidth: 1180,
      margin: "0 auto",
      display: "grid",
      gap: 18,
    },

    header: {
      border:
        "1px solid rgba(202,166,75,0.26)",
      borderRadius: 22,
      padding:
        "clamp(18px, 3vw, 28px)",
      background:
        "linear-gradient(180deg, rgba(202,166,75,0.10), rgba(255,255,255,0.025))",
      boxShadow:
        "0 20px 60px rgba(0,0,0,0.34)",
    },

    eyebrow: {
      color:
        "rgba(202,166,75,0.95)",
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: "0.15em",
      marginBottom: 8,
    },

    title: {
      margin: 0,
      fontSize:
        "clamp(1.6rem, 4vw, 2.45rem)",
      lineHeight: 1.04,
      letterSpacing: "-0.035em",
    },

    subtitle: {
      margin:
        "10px 0 0",
      color:
        "rgba(255,255,255,0.62)",
      fontSize: 14,
      lineHeight: 1.55,
      maxWidth: 780,
    },

    tabs: {
      display: "grid",
      gridTemplateColumns:
        "repeat(4, minmax(0, 1fr))",
      gap: 8,
      padding: 6,
      borderRadius: 18,
      border:
        "1px solid rgba(255,255,255,0.08)",
      background:
        "rgba(255,255,255,0.025)",
    },

    tab: (active) => ({
      minWidth: 0,
      border:
        active
          ? "1px solid rgba(202,166,75,0.52)"
          : "1px solid rgba(255,255,255,0.07)",
      borderRadius: 13,
      minHeight: 44,
      padding:
        "9px 8px",
      cursor: "pointer",
      color:
        active
          ? "#f4d97d"
          : "rgba(255,255,255,0.64)",
      background:
        active
          ? "linear-gradient(180deg, rgba(202,166,75,0.18), rgba(202,166,75,0.055))"
          : "rgba(255,255,255,0.02)",
      fontSize: 11,
      fontWeight: 900,
      letterSpacing: "0.06em",
    }),

    panel: {
      border:
        "1px solid rgba(255,255,255,0.09)",
      borderRadius: 22,
      padding:
        "clamp(16px, 3vw, 26px)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.016))",
      boxShadow:
        "0 20px 60px rgba(0,0,0,0.24)",
    },

    panelTitle: {
      margin: 0,
      fontSize: 17,
      fontWeight: 900,
      letterSpacing: "-0.01em",
    },

    panelSubtitle: {
      margin:
        "7px 0 0",
      color:
        "rgba(255,255,255,0.54)",
      fontSize: 13,
      lineHeight: 1.5,
    },

    lotteryGrid: {
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10,
      marginTop: 18,
    },

    lotteryButton: (active) => ({
      width: "100%",
      minHeight: 58,
      border:
        active
          ? "1px solid rgba(202,166,75,0.62)"
          : "1px solid rgba(255,255,255,0.08)",
      borderRadius: 14,
      padding:
        "10px 12px",
      textAlign: "left",
      color:
        active
          ? "#f4d97d"
          : "rgba(255,255,255,0.82)",
      background:
        active
          ? "rgba(202,166,75,0.10)"
          : "rgba(255,255,255,0.025)",
      cursor: "pointer",
      fontSize: 12,
      fontWeight: 850,
      letterSpacing: "0.035em",
    }),

    selectedCard: {
      marginTop: 18,
      padding: 16,
      borderRadius: 16,
      border:
        "1px solid rgba(202,166,75,0.22)",
      background:
        "rgba(202,166,75,0.045)",
    },

    selectedLabel: {
      color:
        "rgba(255,255,255,0.50)",
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: "0.10em",
    },

    selectedName: {
      marginTop: 5,
      color:
        "#f4d97d",
      fontSize: 18,
      fontWeight: 950,
    },

    hourGrid: {
      display: "grid",
      gridTemplateColumns:
        "repeat(auto-fit, minmax(90px, 1fr))",
      gap: 10,
      marginTop: 18,
    },

    hour: {
      border:
        "1px solid rgba(202,166,75,0.20)",
      borderRadius: 14,
      padding:
        "13px 10px",
      textAlign: "center",
      background:
        "rgba(202,166,75,0.055)",
      color:
        "#f4d97d",
      fontWeight: 900,
      fontVariantNumeric:
        "tabular-nums",
    },

    top3Grid: {
      display: "grid",
      gridTemplateColumns:
        "repeat(3, minmax(0, 1fr))",
      gap: 10,
      marginTop: 18,
    },

    top3Card: {
      minHeight: 126,
      borderRadius: 18,
      border:
        "1px solid rgba(255,255,255,0.08)",
      background:
        "rgba(255,255,255,0.025)",
      display: "grid",
      alignContent: "center",
      justifyItems: "center",
      gap: 8,
      padding: 14,
    },

    top3Position: {
      color:
        "rgba(202,166,75,0.90)",
      fontWeight: 950,
      fontSize: 12,
      letterSpacing: "0.12em",
    },

    top3Empty: {
      fontSize: 28,
      fontWeight: 950,
      color:
        "rgba(255,255,255,0.26)",
    },

    notice: {
      marginTop: 18,
      padding: 16,
      borderRadius: 15,
      border:
        "1px solid rgba(202,166,75,0.17)",
      background:
        "rgba(202,166,75,0.035)",
      color:
        "rgba(255,255,255,0.62)",
      lineHeight: 1.55,
      fontSize: 13,
    },

    historyEmpty: {
      marginTop: 18,
      minHeight: 160,
      borderRadius: 18,
      border:
        "1px dashed rgba(255,255,255,0.13)",
      display: "grid",
      placeItems: "center",
      textAlign: "center",
      padding: 24,
      color:
        "rgba(255,255,255,0.42)",
      fontSize: 13,
      lineHeight: 1.55,
    },
  };

  const renderLotteries =
    () => (
      <section style={ui.panel}>
        <h2 style={ui.panelTitle}>
          Loterias
        </h2>

        <p style={ui.panelSubtitle}>
          Selecione a loteria que será
          analisada pelo Radar dos Bichos.
        </p>

        <div style={ui.lotteryGrid}>
          {LOTTERIES.map(
            (lottery) => {
              const active =
                lottery.key ===
                lotteryKey;

              return (
                <button
                  key={lottery.key}
                  type="button"
                  style={ui.lotteryButton(
                    active
                  )}
                  aria-pressed={active}
                  onClick={() =>
                    setLotteryKey(
                      lottery.key
                    )
                  }
                >
                  {lottery.label}
                </button>
              );
            }
          )}
        </div>

        <div style={ui.selectedCard}>
          <div style={ui.selectedLabel}>
            LOTERIA SELECIONADA
          </div>

          <div style={ui.selectedName}>
            {selectedLottery.label}
          </div>
        </div>
      </section>
    );

  const renderCalendar =
    () => (
      <section style={ui.panel}>
        <h2 style={ui.panelTitle}>
          Calendário —{" "}
          {selectedLottery.label}
        </h2>

        <p style={ui.panelSubtitle}>
          Horários operacionais vindos da
          fonte única de calendário do
          PalPitaco JB.
        </p>

        <div style={ui.hourGrid}>
          {schedule.map(
            (hour) => (
              <div
                key={hour}
                style={ui.hour}
              >
                {hourLabel(hour)}
              </div>
            )
          )}
        </div>

        {schedule.length === 0 && (
          <div style={ui.notice}>
            Nenhum horário operacional
            disponível para esta loteria.
          </div>
        )}
      </section>
    );

  const renderTop3 =
    () => (
      <section style={ui.panel}>
        <h2 style={ui.panelTitle}>
          TOP3 —{" "}
          {selectedLottery.label}
        </h2>

        <p style={ui.panelSubtitle}>
          Estrutura reservada para os três
          bichos calculados pelo motor
          próprio do Radar.
        </p>

        <div style={ui.top3Grid}>
          {[1, 2, 3].map(
            (position) => (
              <div
                key={position}
                style={ui.top3Card}
              >
                <div
                  style={
                    ui.top3Position
                  }
                >
                  {position}º
                </div>

                <div
                  style={ui.top3Empty}
                >
                  —
                </div>
              </div>
            )
          )}
        </div>

        <div style={ui.notice}>
          O cálculo do Radar dos Bichos
          ainda não foi definido. Nenhum
          motor, regra ou previsão do TOP3
          atual foi conectado a esta página.
        </div>
      </section>
    );

  const renderHistory =
    () => (
      <section style={ui.panel}>
        <h2 style={ui.panelTitle}>
          Histórico —{" "}
          {selectedLottery.label}
        </h2>

        <p style={ui.panelSubtitle}>
          Área reservada ao histórico das
          previsões produzidas pelo Radar.
        </p>

        <div style={ui.historyEmpty}>
          Nenhuma previsão do Radar existe
          nesta etapa.
          <br />
          O histórico será alimentado
          somente quando o cálculo próprio
          estiver definido e validado.
        </div>
      </section>
    );

  return (
    <div
      style={ui.page}
      data-page="radar-dos-bichos"
      data-engine-connected="false"
    >
      <div style={ui.inner}>
        <header style={ui.header}>
          <div style={ui.eyebrow}>
            PALPITACO JB
          </div>

          <h1 style={ui.title}>
            RADAR DOS BICHOS
          </h1>

          <p style={ui.subtitle}>
            Leitura independente por
            loteria e horário. A estrutura
            está pronta para receber o
            cálculo próprio do Radar sem
            interferir no motor TOP3 já
            existente.
          </p>
        </header>

        <nav
          style={ui.tabs}
          aria-label="Seções do Radar dos Bichos"
        >
          {TABS.map(
            (tab) => {
              const active =
                activeTab ===
                tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  style={ui.tab(active)}
                  aria-pressed={active}
                  onClick={() =>
                    setActiveTab(
                      tab.key
                    )
                  }
                >
                  {tab.label}
                </button>
              );
            }
          )}
        </nav>

        {activeTab ===
          "lotteries" &&
          renderLotteries()}

        {activeTab ===
          "calendar" &&
          renderCalendar()}

        {activeTab ===
          "top3" &&
          renderTop3()}

        {activeTab ===
          "history" &&
          renderHistory()}
      </div>
    </div>
  );
}