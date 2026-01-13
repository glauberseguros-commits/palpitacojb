// src/pages/Dashboard/components/KpiCards.jsx
import React, { useMemo } from "react";

/**
 * KPI cards (top right) — premium executivo (legível e responsivo)
 * - Mantém compatibilidade: items / columns / gap / drawsRaw
 * - Se items vier faltando/ruim, calcula via drawsRaw:
 *   - Sorteios = drawsRaw.length
 *   - Dias = unique dates (robusto)
 *
 * ✅ Ajuste desta versão:
 * - Remove bolinha dourada ao lado do número
 * - Centraliza TÍTULO + NÚMERO (horizontalmente) dentro do card
 * - Mantém o “desce levemente” do número para casar com o fim do banner
 * - Mantém tipografia responsiva com clamp()
 * - Mantém layout estável sem “explodir” altura
 *
 * ✅ NOVO (padrão ChartsGrid):
 * - drawsRaw = VIEW (filtrado)
 * - drawsRawGlobal = GLOBAL (sem filtros) [opcional]
 * - showGlobalAparicoes (default false): adiciona KPI "Aparições (Geral)" baseado em prizes do GLOBAL.
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeToYMD(input) {
  if (!input) return null;

  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);

    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
  }

  const s = String(input).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function getDrawDate(draw) {
  if (!draw) return null;

  const raw =
    draw.date ??
    draw.ymd ??
    draw.draw_date ??
    draw.drawDate ??
    draw.close_date ??
    draw.data ??
    draw.dt ??
    draw.day ??
    null;

  return normalizeToYMD(raw);
}

function isBadValue(v) {
  return v === null || v === undefined || v === "" || v === "-" || v === "—";
}

/* =========================
   Animal KPIs helpers (opcional)
========================= */

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getPrizeGrupo(prize) {
  if (!prize || typeof prize !== "object") return null;
  const n = safeNum(prize.grupo ?? prize.group ?? null);
  if (!n || n < 1 || n > 25) return null;
  return n;
}

function getPrizePosition(prize) {
  if (!prize || typeof prize !== "object") return null;

  const n =
    safeNum(prize.position) ??
    safeNum(prize.posicao) ??
    safeNum(prize.pos) ??
    safeNum(prize.place) ??
    null;

  if (!n || n < 1 || n > 10) return null;
  return n;
}

function cleanLabel(s) {
  const v = String(s ?? "").trim();
  return v || null;
}

/* =========================
   GLOBAL (Aparições) — prizes
========================= */

function countAparicoesGlobal(drawsRawGlobal) {
  const draws = Array.isArray(drawsRawGlobal) ? drawsRawGlobal : [];
  let apar = 0;

  for (const d of draws) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
    // Conta cada prize como 1 aparição (posições normalmente 1..7)
    // Se vier sujo, ainda assim conta o item existente (sem “chute”).
    apar += prizes.length;
  }

  return apar;
}

export default function KpiCards({
  items,
  columns = 2,
  gap = 12,

  // ✅ VIEW (filtrado)
  drawsRaw,

  // ✅ GLOBAL (sem filtros) — opcional
  drawsRawGlobal = null,

  // ✅ se true, adiciona KPI global "Aparições (Geral)"
  showGlobalAparicoes = false,

  selectedGrupo = null,
  selectedAnimalLabel = null,
  selectedPosition = null,
}) {
  const computedBase = useMemo(() => {
    const draws = Array.isArray(drawsRaw) ? drawsRaw : [];
    const totalSorteios = draws.length;

    const days = new Set();
    for (const d of draws) {
      const ymd = getDrawDate(d);
      if (ymd) days.add(ymd);
    }

    return { dias: days.size, sorteios: totalSorteios };
  }, [drawsRaw]);

  const computedGlobal = useMemo(() => {
    const globalArr = Array.isArray(drawsRawGlobal) ? drawsRawGlobal : null;
    const fallback = Array.isArray(drawsRaw) ? drawsRaw : [];
    const base = globalArr ?? fallback;

    return {
      aparicoesGeral: countAparicoesGlobal(base),
    };
  }, [drawsRawGlobal, drawsRaw]);

  const computedAnimal = useMemo(() => {
    const g = safeNum(selectedGrupo);
    const pos = safeNum(selectedPosition);

    if (!g || g < 1 || g > 25) {
      return {
        enabled: false,
        ocorrencias: 0,
        diasComOcorrencia: 0,
        drawsComOcorrencia: 0,
        ocorrenciasNaPosicao: null,
        drawsComOcorrenciaNaPosicao: null,
      };
    }

    const draws = Array.isArray(drawsRaw) ? drawsRaw : [];

    let ocorrencias = 0;
    const diasComOcorrenciaSet = new Set();
    let drawsComOcorrencia = 0;

    let ocorrenciasNaPosicao = pos && pos >= 1 && pos <= 7 ? 0 : null;
    let drawsComOcorrenciaNaPosicao = pos && pos >= 1 && pos <= 7 ? 0 : null;

    for (const d of draws) {
      const ymd = getDrawDate(d);

      const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
      let drawHas = false;
      let drawHasPos = false;

      for (const p of prizes) {
        const pg = getPrizeGrupo(p);
        if (pg !== g) continue;

        ocorrencias += 1;
        drawHas = true;

        if (ocorrenciasNaPosicao !== null && drawsComOcorrenciaNaPosicao !== null) {
          const pp = getPrizePosition(p);
          if (pp === pos) {
            ocorrenciasNaPosicao += 1;
            drawHasPos = true;
          }
        }
      }

      if (drawHas) {
        drawsComOcorrencia += 1;
        if (ymd) diasComOcorrenciaSet.add(ymd);
      }

      if (drawHasPos && drawsComOcorrenciaNaPosicao !== null) {
        drawsComOcorrenciaNaPosicao += 1;
      }
    }

    return {
      enabled: true,
      ocorrencias,
      diasComOcorrencia: diasComOcorrenciaSet.size,
      drawsComOcorrencia,
      ocorrenciasNaPosicao,
      drawsComOcorrenciaNaPosicao,
    };
  }, [drawsRaw, selectedGrupo, selectedPosition]);

  const baseData = useMemo(() => {
    if (Array.isArray(items) && items.length) {
      return items.map((it) => {
        const key = String(it?.key || "").toLowerCase();
        if (key === "dias" && isBadValue(it?.value)) return { ...it, value: computedBase.dias };
        if (key === "sorteios" && isBadValue(it?.value))
          return { ...it, value: computedBase.sorteios };
        return it;
      });
    }

    return [
      { key: "dias", title: "Qtde Dias de sorteio", value: computedBase.dias, icon: "calendar" },
      { key: "sorteios", title: "Qtde de sorteios", value: computedBase.sorteios, icon: "ticket" },
    ];
  }, [items, computedBase.dias, computedBase.sorteios]);

  const data = useMemo(() => {
    let out = baseData;

    // ✅ KPI global opcional (não polui por padrão)
    if (showGlobalAparicoes) {
      out = [
        ...out,
        {
          key: "aparicoes_geral",
          title: "Aparições (Geral)",
          value: computedGlobal.aparicoesGeral,
          icon: "ticket",
        },
      ];
    }

    if (!computedAnimal.enabled) return out;

    const label = cleanLabel(selectedAnimalLabel);
    const g = safeNum(selectedGrupo);
    const nameSuffix = label ? ` (${label})` : g ? ` (Grupo ${pad2(g)})` : "";

    const extra = [
      {
        key: "ocorrencias_animal",
        title: `Ocorrências do animal${nameSuffix}`,
        value: computedAnimal.ocorrencias,
        icon: "ticket",
      },
      {
        key: "dias_com_ocorrencia",
        title: `Dias com ocorrência${nameSuffix}`,
        value: computedAnimal.diasComOcorrencia,
        icon: "calendar",
      },
      {
        key: "draws_com_ocorrencia",
        title: `Draws com ocorrência${nameSuffix}`,
        value: computedAnimal.drawsComOcorrencia,
        icon: "ticket",
      },
    ];

    const pos = safeNum(selectedPosition);
    if (
      pos &&
      pos >= 1 &&
      pos <= 7 &&
      computedAnimal.ocorrenciasNaPosicao !== null &&
      computedAnimal.drawsComOcorrenciaNaPosicao !== null
    ) {
      extra.push(
        {
          key: "ocorrencias_animal_pos",
          title: `Ocorrências na posição ${pos}º${nameSuffix}`,
          value: computedAnimal.ocorrenciasNaPosicao,
          icon: "ticket",
        },
        {
          key: "draws_animal_pos",
          title: `Draws com ocorrência na posição ${pos}º${nameSuffix}`,
          value: computedAnimal.drawsComOcorrenciaNaPosicao,
          icon: "calendar",
        }
      );
    }

    return [...out, ...extra];
  }, [
    baseData,
    computedAnimal,
    selectedAnimalLabel,
    selectedGrupo,
    selectedPosition,
    showGlobalAparicoes,
    computedGlobal.aparicoesGeral,
  ]);

  const ui = useMemo(() => {
    const cols = Math.max(1, Number(columns) || 2);

    return {
      wrap: {
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap,
        width: "100%",
        minWidth: 0,
        alignItems: "stretch",
      },

      card: {
        border: "1px solid var(--border)",
        borderRadius: 16,
        background: "rgba(0,0,0,0.62)",
        boxShadow: "var(--shadowTight)",
        padding: 12,
        minHeight: 92,
        display: "grid",
        gridTemplateRows: "auto 1px 1fr",
        alignContent: "stretch",
        overflow: "hidden",
        position: "relative",
        minWidth: 0,
        outline: "1px solid rgba(201,168,62,0.07)",
        outlineOffset: "-1px",
      },

      shine: {
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(700px 160px at 18% 0%, rgba(255,255,255,0.060) 0%, rgba(255,255,255,0.00) 56%)",
        pointerEvents: "none",
      },

      // ✅ CENTRALIZA o topo
      head: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        minWidth: 0,
      },

      iconBox: {
        width: 30,
        height: 30,
        borderRadius: 11,
        border: "1px solid var(--border2)",
        background: "rgba(0,0,0,0.72)",
        display: "grid",
        placeItems: "center",
        flex: "0 0 auto",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.05)",
      },

      // ✅ título centralizado
      title: {
        fontSize: "clamp(13px, 0.9vw, 15px)",
        fontWeight: 850,
        letterSpacing: 0.16,
        opacity: 0.92,
        lineHeight: 1.15,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
        textAlign: "center",
      },

      divider: {
        marginTop: 8,
        height: 1,
        width: "100%",
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.085), rgba(255,255,255,0.02) 58%, rgba(255,255,255,0.00))",
        opacity: 0.9,
      },

      // ✅ CENTRALIZA o número + mantém “descer” p/ casar com banner
      numberArea: {
        display: "grid",
        alignItems: "center",
        justifyItems: "center",
        paddingTop: 8,
        paddingBottom: 10,
        minWidth: 0,
        transform: "translateY(6px)",
      },

      // ✅ garante centralização do conteúdo interno também
      numberRow: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "center",
        gap: 10,
        minWidth: 0,
      },

      value: {
        fontSize: "clamp(28px, 2.2vw, 34px)",
        fontWeight: 950,
        letterSpacing: 0.2,
        lineHeight: 1,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        minWidth: 0,
      },

      suffix: {
        fontSize: "clamp(12px, 0.9vw, 14px)",
        fontWeight: 850,
        opacity: 0.76,
        letterSpacing: 0.12,
        flex: "0 0 auto",
      },

      styleTag: `
        @media (max-width: 720px){
          .pp_kpis_wrap{
            grid-template-columns: 1fr !important;
          }
        }
      `,
    };
  }, [columns, gap]);

  const formatValue = (v) => {
    if (isBadValue(v)) return "0";
    const n = Number(v);
    if (Number.isFinite(n)) return n.toLocaleString("pt-BR");
    return String(v);
  };

  const CalendarIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 2v3M17 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M7 13h4M7 17h6"
        stroke="rgba(201,168,62,0.92)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  const TicketIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4V7Z"
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9 9h6M9 15h6"
        stroke="rgba(201,168,62,0.92)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );

  const iconFor = (name) => {
    const n = String(name || "").toLowerCase();
    if (n === "calendar") return <CalendarIcon />;
    if (n === "ticket") return <TicketIcon />;
    return <TicketIcon />;
  };

  return (
    <>
      <style>{ui.styleTag}</style>

      <div className="pp_kpis_wrap" style={ui.wrap}>
        {data.map((kpi, idx) => {
          const key = String(kpi?.key || kpi?.title || `kpi_${idx}`);

          return (
            <div key={key} style={ui.card}>
              <div style={ui.shine} />

              <div style={ui.head}>
                <div style={ui.iconBox}>{iconFor(kpi.icon)}</div>
                <div style={ui.title} title={kpi.title}>
                  {kpi.title}
                </div>
              </div>

              <div style={ui.divider} />

              <div style={ui.numberArea}>
                <div style={ui.numberRow}>
                  <span style={ui.value}>{formatValue(kpi.value)}</span>
                  {kpi.suffix ? <span style={ui.suffix}>{kpi.suffix}</span> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
