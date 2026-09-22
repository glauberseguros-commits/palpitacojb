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

import { LOTTERY_CATALOG_DISPLAY_GLOBAL, getLotteryGlobal, getLotteryKeyBySlugGlobal, getLotterySlugGlobal, normalizeLotteryKeyGlobal } from "../../constants/lotteryCatalog";
const TOP3_ENGINE_LOTTERIES = Object.freeze([
  "PT_RIO",
  "PT_SP",
  "FEDERAL",
  "LOOK",
  "NACIONAL",
]);

const TOP3_ENGINE_LOTTERY_SET =
  new Set(
    TOP3_ENGINE_LOTTERIES
  );

const TOP3_GLOBAL_OPTIONS =
  Object.freeze(
    LOTTERY_CATALOG_DISPLAY_GLOBAL.map(
      (lottery) =>
        Object.freeze({
          value: lottery.key,
          label: lottery.label,
        })
    )
  );

function isTop3EngineLottery(
  lotteryKey
) {
  const key =
    normalizeLotteryKeyGlobal(
      lotteryKey
    );

  return (
    !!key &&
    TOP3_ENGINE_LOTTERY_SET.has(
      key
    )
  );
}

function normalizeTop3RoutePath(pathname) {
  const raw = String(pathname || "").trim().toLowerCase();
  const normalized = raw.replace(/\/+$/, "");
  return normalized || "/top3";
}

function lotteryFromTop3Path(pathname) {
  const routePath =
    normalizeTop3RoutePath(
      pathname
    );

  if (
    routePath === "/top3"
  ) {
    return "PT_RIO";
  }

  const match =
    routePath.match(
      /^\/top3\/([^/]+)$/
    );

  const slug =
    String(
      match?.[1] || ""
    )
      .trim()
      .toLowerCase();

  if (!slug) {
    return "";
  }

  return (
    getLotteryKeyBySlugGlobal(
      slug
    ) ||
    ""
  );
}

function top3PathForLottery(lotteryKey) {
  const key =
    normalizeLotteryKeyGlobal(
      lotteryKey
    );

  if (!key) {
    return "";
  }

  const slug =
    getLotterySlugGlobal(
      key
    );

  return slug
    ? `/top3/${slug}`
    : "";
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

function Top3SupportedRuntime({
  routeLottery,
}) {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const controller =
    useTop3Controller(
      routeLottery
    );

  const {
    lotteryKeySafe,
    setLotteryKey,
  } = controller;

  React.useEffect(() => {
    if (
      !isTop3EngineLottery(
        routeLottery
      )
    ) {
      return;
    }

    if (
      lotteryKeySafe !==
      routeLottery
    ) {
      setLotteryKey(
        routeLottery
      );
    }
  }, [
    routeLottery,
    lotteryKeySafe,
    setLotteryKey,
  ]);

  const setLotteryKeyWithRoute =
    React.useCallback(
      (nextLotteryKey) => {
        const key =
          normalizeLotteryKeyGlobal(
            nextLotteryKey
          );

        if (!key) {
          return;
        }

        const targetPath =
          top3PathForLottery(
            key
          );

        if (!targetPath) {
          return;
        }

        const currentPath =
          normalizeTop3RoutePath(
            location?.pathname
          );

        if (
          !isTop3EngineLottery(
            key
          )
        ) {
          navigate(
            targetPath
          );
          return;
        }

        if (
          currentPath ===
          targetPath
        ) {
          if (
            lotteryKeySafe !== key
          ) {
            setLotteryKey(
              key
            );
          }

          return;
        }

        navigate(
          targetPath
        );
      },
      [
        location?.pathname,
        navigate,
        lotteryKeySafe,
        setLotteryKey,
      ]
    );

  return (
    <Top3View
      {...controller}
      LOTTERY_OPTIONS={
        TOP3_GLOBAL_OPTIONS
      }
      setLotteryKey={
        setLotteryKeyWithRoute
      }
    />
  );
}

function Top3CatalogOnlyState({
  lotteryKey,
}) {
  const navigate =
    useNavigate();

  const lottery =
    getLotteryGlobal(
      lotteryKey
    );

  const selectedValue =
    lottery?.key || "";

  const onChange =
    (event) => {
      const nextKey =
        normalizeLotteryKeyGlobal(
          event.target.value
        );

      const nextPath =
        top3PathForLottery(
          nextKey
        );

      if (nextPath) {
        navigate(
          nextPath
        );
      }
    };

  return (
    <section
      style={{
        width: "min(1180px, calc(100% - 32px))",
        margin: "0 auto",
        padding: "32px 0 64px",
      }}
    >
      <div
        style={{
          border: "1px solid rgba(202,166,75,.32)",
          borderRadius: 18,
          background: "rgba(10,10,10,.92)",
          padding: 20,
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: ".08em",
            opacity: .65,
            marginBottom: 8,
          }}
        >
          TOP3
        </div>

        <h2
          style={{
            margin: "0 0 18px",
          }}
        >
          {lottery
            ? lottery.label
            : "Loteria"}
        </h2>

        <label
          style={{
            display: "block",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 800,
              marginBottom: 7,
            }}
          >
            Loteria
          </span>

          <select
            value={
              selectedValue
            }
            onChange={
              onChange
            }
            style={{
              width: "100%",
              maxWidth: 360,
              height: 42,
              borderRadius: 12,
              padding: "0 12px",
              background: "#111",
              color: "#fff",
              border: "1px solid rgba(202,166,75,.40)",
            }}
          >
            {!selectedValue ? (
              <option value="">
                Selecione uma loteria
              </option>
            ) : null}

            {TOP3_GLOBAL_OPTIONS.map(
              (option) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              )
            )}
          </select>
        </label>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(255,255,255,.04)",
            lineHeight: 1.5,
          }}
        >
          {lottery
            ? "Esta loteria faz parte do catálogo do PalPitaco JB, mas o TOP3 ainda não possui motor configurado para ela."
            : "Esta rota não corresponde a uma loteria reconhecida no catálogo."}
        </div>
      </div>
    </section>
  );
}

function Top3Authenticated() {
  const location =
    useLocation();

  const navigate =
    useNavigate();

  const routeLottery =
    lotteryFromTop3Path(
      location?.pathname
    );

  React.useEffect(() => {
    const currentPath =
      normalizeTop3RoutePath(
        location?.pathname
      );

    if (
      currentPath === "/top3"
    ) {
      navigate(
        "/top3/rj",
        {
          replace: true,
        }
      );
    }
  }, [
    location?.pathname,
    navigate,
  ]);

  if (
    !routeLottery
  ) {
    return (
      <Top3CatalogOnlyState
        lotteryKey=""
      />
    );
  }

  if (
    !isTop3EngineLottery(
      routeLottery
    )
  ) {
    return (
      <Top3CatalogOnlyState
        lotteryKey={
          routeLottery
        }
      />
    );
  }

  return (
    <Top3SupportedRuntime
      routeLottery={
        routeLottery
      }
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
