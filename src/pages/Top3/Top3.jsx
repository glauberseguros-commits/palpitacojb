// src/pages/Top3/Top3.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  ACCESS_CAPABILITY,
  can,
  loadAccessSession,
} from "../../services/accessControl";

import { useTop3Controller } from "./top3.hooks";
import Top3View from "./Top3View";

const TOP3_ROUTE_TO_LOTTERY = Object.freeze({
  rj: "PT_RIO",
  sp: "PT_SP",
  federal: "FEDERAL",
  look: "LOOK",
  nacional: "NACIONAL",
});

const TOP3_LOTTERY_TO_ROUTE = Object.freeze({
  PT_RIO: "/top3/rj",
  RJ: "/top3/rj",
  PT_SP: "/top3/sp",
  FEDERAL: "/top3/federal",
  LOOK: "/top3/look",
  NACIONAL: "/top3/nacional",
});

function normalizeTop3RoutePath(pathname) {
  const raw = String(pathname || "").trim().toLowerCase();
  const normalized = raw.replace(/\/+$/, "");
  return normalized || "/top3";
}

function lotteryFromTop3Path(pathname) {
  const path = normalizeTop3RoutePath(pathname);

  if (path === "/top3") {
    return "PT_RIO";
  }

  const match = path.match(/^\/top3\/([^/]+)$/);
  const slug = String(match?.[1] || "").toLowerCase();

  return TOP3_ROUTE_TO_LOTTERY[slug] || "PT_RIO";
}

function top3PathForLottery(lotteryKey) {
  const key = String(lotteryKey || "").trim().toUpperCase();
  return TOP3_LOTTERY_TO_ROUTE[key] || "/top3/rj";
}

/**
 * PALPITACO JB — TOP3 GUEST HARD GATE
 *
 * O Guest não monta o controller real do TOP3.
 *
 * Consequências:
 * - não recebe os palpites reais;
 * - não inicializa o motor desta tela;
 * - não carrega snapshots do TOP3 por esta árvore;
 * - não gera centenas/milhares por esta árvore;
 * - não monta Top3View.
 *
 * Usuários autorizados continuam utilizando exatamente
 * o controller e a view existentes.
 */

function Top3GuestPreview() {
  return (
    <section
      data-top3-guest-preview="true"
      style={{
        width: "100%",
        maxWidth: 1180,
        margin: "0 auto",
        padding: "24px 16px 40px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          border: "1px solid rgba(212, 175, 55, 0.35)",
          borderRadius: 18,
          padding: "28px 20px",
          background:
            "linear-gradient(180deg, rgba(24,24,24,0.98), rgba(10,10,10,0.98))",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.14em",
            color: "#d4af37",
            marginBottom: 12,
          }}
        >
          TOP3
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: "clamp(24px, 5vw, 36px)",
            lineHeight: 1.15,
          }}
        >
          Área de palpites
        </h1>

        <p
          style={{
            maxWidth: 620,
            margin: "16px auto 0",
            lineHeight: 1.6,
            opacity: 0.78,
          }}
        >
          Esta é uma área exclusiva para usuários com acesso aos palpites
          do Palpitaco JB.
        </p>

        <div
          style={{
            maxWidth: 760,
            margin: "28px auto 0",
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {["1º PALPITE", "2º PALPITE", "3º PALPITE"].map((label) => (
            <div
              key={label}
              aria-hidden="true"
              style={{
                minHeight: 150,
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.025)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  opacity: 0.48,
                }}
              >
                {label}
              </div>

              <div
                style={{
                  marginTop: 16,
                  fontSize: 32,
                  lineHeight: 1,
                  opacity: 0.18,
                }}
              >
                •••
              </div>

              <div
                style={{
                  marginTop: 14,
                  fontSize: 12,
                  opacity: 0.4,
                }}
              >
                Conteúdo exclusivo
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            margin: "24px auto 0",
            fontSize: 13,
            opacity: 0.58,
          }}
        >
          Entre ou assine um plano para visualizar os palpites completos.
        </p>
      </div>
    </section>
  );
}

function Top3Authenticated() {
  const location = useLocation();
  const navigate = useNavigate();

  const initialLotteryKey = lotteryFromTop3Path(location?.pathname);
  const controller = useTop3Controller(initialLotteryKey);
  const { lotteryKeySafe, setLotteryKey } = controller;

  React.useEffect(() => {
    const routeLottery = lotteryFromTop3Path(location?.pathname);
    const currentPath = normalizeTop3RoutePath(location?.pathname);
    const canonicalPath = top3PathForLottery(routeLottery);

    if (lotteryKeySafe !== routeLottery) {
      setLotteryKey(routeLottery);
    }

    if (currentPath !== canonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [
    location?.pathname,
    navigate,
    lotteryKeySafe,
    setLotteryKey,
  ]);

  const setLotteryKeyWithRoute = React.useCallback(
    (nextLotteryKey) => {
      const key = String(nextLotteryKey || "").trim().toUpperCase();
      const targetPath = top3PathForLottery(key);
      const currentPath = normalizeTop3RoutePath(location?.pathname);

      if (!TOP3_LOTTERY_TO_ROUTE[key]) {
        return;
      }

      if (currentPath === targetPath) {
        if (lotteryKeySafe !== key) {
          setLotteryKey(key);
        }
        return;
      }

      navigate(targetPath);
    },
    [
      lotteryKeySafe,
      setLotteryKey,
      location?.pathname,
      navigate,
    ]
  );

  return (
    <Top3View
      {...controller}
      setLotteryKey={setLotteryKeyWithRoute}
    />
  );
}

export default function Top3() {
  const session = loadAccessSession();

  const canAccessLivePredictions = can(
    session,
    ACCESS_CAPABILITY.ACCESS_LIVE_PREDICTIONS
  );

  if (!canAccessLivePredictions) {
    return <Top3GuestPreview />;
  }

  return <Top3Authenticated />;
}
