// src/pages/Dashboard/components/ChartsGrid.jsx
import React, { useMemo } from "react";
import { getAnimalLabel } from "../../../constants/bichoMap";

/**
 * ChartsGrid (premium, sem libs)
 *
 * ✅ REGRA DO PROJETO:
 * - Os gráficos e contagens aqui devem ser baseados em APARIÇÕES (prizes),
 *   e não em "draws" (sorteios).
 * - Um mesmo draw pode conter o mesmo animal em várias posições ⇒ conta várias aparições.
 *
 * ✅ NOVO (seleção via LeftRankingTable):
 * - Quando selectedGrupo != null:
 *   - Mês/Dia Semana/Horário: contam APENAS as aparições (prizes) do grupo selecionado.
 *   - "Aparições por Posição": vira distribuição do grupo selecionado por posição (1º..7º), mantendo clique.
 *
 * ✅ REGRA DO CARD "Quantidade de Aparições":
 * - NÃO pode obedecer filtros e NÃO pode sumir bicho.
 * - Deve SEMPRE listar os 25 bichos (mesmo com 0), com scroll.
 * - Base: dataset GLOBAL (drawsRawGlobal), sem aplicar filtros locais nem selectedGrupo.
 *
 * ✅ Compat:
 * - Se drawsRawGlobal NÃO for passado, cai no fallback drawsRaw (não quebra, mas o card global obedecerá filtros).
 *
 * ✅ NOVO (opcional):
 * - disabledInteractions (boolean): se true, desativa cliques (posição) sem quebrar UI.
 */

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/**
 * ✅ Normaliza "qualquer data" para YYYY-MM-DD (ou null).
 */
function normalizeToYMD(input) {
  if (!input) return null;

  // Firestore Timestamp com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      // ✅ UTC para não "voltar um dia" por timezone
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }

  // Timestamp-like { seconds } / { _seconds }
  if (
    typeof input === "object" &&
    (Number.isFinite(Number(input.seconds)) || Number.isFinite(Number(input._seconds)))
  ) {
    const sec = Number.isFinite(Number(input.seconds))
      ? Number(input.seconds)
      : Number(input._seconds);

    const d = new Date(sec * 1000);
    if (!Number.isNaN(d.getTime())) {
      // ✅ UTC para não "voltar um dia" por timezone
      return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
    }
  }

  // Date
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    // ✅ UTC para consistência total
    return `${input.getUTCFullYear()}-${pad2(input.getUTCMonth() + 1)}-${pad2(input.getUTCDate())}`;
  }

  const s = String(input).trim();
  if (!s) return null;

  // YYYY-MM-DD...
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // DD/MM/YYYY
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

/**
 * ✅ Resolve data do draw independente do nome do campo vindo do Firestore/backend
 */
function getDrawDate(draw) {
  if (!draw) return null;

  const raw =
    draw.date ??
    draw.ymd ??
    draw.draw_date ??
    draw.close_date ??
    draw.data ??
    draw.dt ??
    null;

  return normalizeToYMD(raw);
}

/**
 * ✅ Resolve close_hour independente do nome do campo
 */
function getDrawCloseHour(draw) {
  if (!draw) return "";
  return String(draw.close_hour ?? draw.closeHour ?? draw.hour ?? draw.hora ?? "").trim();
}

/**
 * ✅ Resolve lottery key (quando existir)
 */
function getDrawLotteryKey(draw) {
  if (!draw) return "";
  return String(
    draw.lottery_key ??
      draw.lotteryKey ??
      draw.lottery ??
      draw.loteria ??
      draw.lotteryId ??
      ""
  ).trim();
}

/**
 * ✅ Mês por extenso (PT-BR) a partir de YYYY-MM-DD
 */
function getMonthPT(dateInput) {
  const ymd = normalizeToYMD(dateInput);
  if (!ymd) return null;

  const m = Number(ymd.slice(5, 7));
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];
  return meses[m - 1] || null;
}

/**
 * ✅ Normaliza close_hour para HH:MM
 */
function normHHMM(value) {
  const s0 = String(value || "").trim();
  if (!s0) return null;

  const s = s0.toLowerCase();

  // "09:00h" / "09:00"
  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*h?$/i);
  if (mISO) {
    const hh = String(mISO[1]).padStart(2, "0");
    const mm = String(mISO[2]).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // "09h00" / "9h00" / "09h00m"
  const mhm = s.match(/^(\d{1,2})\s*h\s*(\d{1,2})?\s*(m|min)?\s*s?$/i);
  if (mhm) {
    const hh = String(mhm[1]).padStart(2, "0");
    const mm = String(mhm[2] ?? "0").padStart(2, "0");
    return `${hh}:${mm}`;
  }

  // "9h" / "09h" / "09hs"
  const mh = s.match(/^(\d{1,2})\s*h\s*s?$/i);
  if (mh) return `${String(mh[1]).padStart(2, "0")}:00`;

  // "9" / "09"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${String(m2[1]).padStart(2, "0")}:00`;

  return null;
}

/**
 * ✅ Mapeia HH:MM -> BUCKET "09h" etc.
 */
function hhmmToBucket09h(value) {
  const hhmm = normHHMM(value);
  if (!hhmm) return null;
  const hh = hhmm.slice(0, 2);
  if (!/^\d{2}$/.test(hh)) return null;
  return `${hh}h`;
}

function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function fmtIntPT(n) {
  try {
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(safeNumber(n));
  } catch {
    return String(safeNumber(n));
  }
}

/**
 * ✅ DEDUPE conservador (sem colapsar draws reais)
 */
function dedupeDraws(drawsRaw) {
  const arr = Array.isArray(drawsRaw) ? drawsRaw : [];
  if (!arr.length) return arr;

  const seen = new Set();
  const out = [];

  const prizeSig = (draw) => {
    const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
    if (!prizes.length) return "noprz";
    const parts = prizes
      .slice(0, 12)
      .map((pz) => {
        const pos = String(pz?.posicao ?? pz?.position ?? "").trim();
        const g = String(pz?.grupo ?? pz?.group ?? pz?.g ?? "").replace(/\D/g, "");
        const n = String(
          pz?.milhar ??
            pz?.milhar4 ??
            pz?.numero ??
            pz?.number ??
            pz?.num ??
            pz?.num4 ??
            ""
        )
          .replace(/\D/g, "")
          .slice(-4);
        return `${pos}:${g}:${n}`;
      })
      .join("|");
    return parts || "noprz";
  };

  for (const d of arr) {
    const idKey =
      (d?.drawId != null && String(d.drawId).trim()) ||
      (d?.id != null && String(d.id).trim()) ||
      "";

    if (idKey) {
      if (seen.has(`id:${idKey}`)) continue;
      seen.add(`id:${idKey}`);
      out.push(d);
      continue;
    }

    const ymd = getDrawDate(d) || "";
    const hhmm = normHHMM(getDrawCloseHour(d)) || "";
    const lot = getDrawLotteryKey(d) || "";
    const sig = prizeSig(d);

    if (!ymd || !hhmm) {
      out.push(d);
      continue;
    }

    const key = `logic:${ymd}__${hhmm}__${lot}__${sig}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }

  return out;
}

/* =========================
   POSIÇÕES: coerência de UI
========================= */

function parseExpectedPositionsFromFilters(filters) {
  const raw = String(filters?.posicao ?? "Todos").trim();
  if (!raw || raw.toLowerCase() === "todos") {
    return [1, 2, 3, 4, 5, 6, 7];
  }

  const m = raw.match(/^(\d+)\s*º?$/);
  if (m) {
    const n = Number(m[1]);
    return Number.isFinite(n) ? [n] : [1];
  }

  return [1, 2, 3, 4, 5, 6, 7];
}

function prettyPosLabel(n) {
  const x = Number(n);
  return Number.isFinite(x) ? `${x}º` : String(n);
}

function normalizePosFilter(filters) {
  const raw = String(filters?.posicao ?? "Todos").trim();
  if (!raw || raw.toLowerCase() === "todos") return null;
  const m = raw.match(/^(\d+)\s*º?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * ✅ Lê grupo/posição de um prize com compatibilidade
 * (blindagem extra: aceita "01", 1, "1º", etc.)
 */
function getPrizeGrupo(pz) {
  const g =
    pz?.grupo ??
    pz?.group ??
    pz?.grupo1 ??
    pz?.grupo_1 ??
    pz?.g ??
    null;

  const digits = String(g ?? "").replace(/\D/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

function getPrizePos(pz) {
  const raw = pz?.posicao ?? pz?.position ?? null;
  if (raw == null) return null;

  // aceita number, "1", "1º", "01", etc.
  const digits = String(raw).replace(/\D/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * ✅ Detecta se um draw "contém" o grupo selecionado (qualquer posição)
 */
function drawHasGrupo(draw, selectedGrupo) {
  const gSel = Number(selectedGrupo);
  if (!Number.isFinite(gSel) || gSel < 1 || gSel > 25) return false;

  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
  for (const pz of prizes) {
    const g = getPrizeGrupo(pz);
    if (g === gSel) return true;
  }
  return false;
}

/**
 * ✅ Conta aparições do grupo selecionado (por posição) e total
 */
function countGrupoAparicoes(draws, selectedGrupo, expectedPositions) {
  const gSel = Number(selectedGrupo);
  if (!Number.isFinite(gSel) || gSel < 1 || gSel > 25) {
    return { total: 0, byPos: [] };
  }

  const posList =
    Array.isArray(expectedPositions) && expectedPositions.length
      ? expectedPositions.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [1, 2, 3, 4, 5, 6, 7];

  const map = new Map(posList.map((p) => [p, 0]));
  let total = 0;

  const safeDraws = Array.isArray(draws) ? draws : [];
  for (const d of safeDraws) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
    for (const pz of prizes) {
      const g = getPrizeGrupo(pz);
      if (g !== gSel) continue;

      const pos = getPrizePos(pz);
      if (!pos || !map.has(pos)) continue;

      map.set(pos, (map.get(pos) || 0) + 1);
      total += 1;
    }
  }

  const byPos = posList.map((p) => ({ label: prettyPosLabel(p), value: map.get(p) || 0 }));
  return { total, byPos };
}

/**
 * ✅ Conta APARIÇÕES no draw com recortes coerentes:
 * - se selectedGrupo válido: conta só prizes do grupo
 * - se selectedPosOrNull: conta só prizes daquela posição
 * - se expectedPositions: restringe ao domínio permitido (ex.: 1..7)
 */
function countAparicoesInDraw(draw, { selectedGrupo, selectedPosOrNull, expectedPositions } = {}) {
  const prizes = Array.isArray(draw?.prizes) ? draw.prizes : [];
  if (!prizes.length) return 0;

  const gSel = Number(selectedGrupo);
  const hasGrupo = Number.isFinite(gSel) && gSel >= 1 && gSel <= 25;

  const posDomain =
    Array.isArray(expectedPositions) && expectedPositions.length
      ? new Set(expectedPositions.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))
      : new Set([1, 2, 3, 4, 5, 6, 7]);

  const posFilter = Number(selectedPosOrNull);
  const hasPosFilter = Number.isFinite(posFilter) && posFilter > 0;

  let c = 0;
  for (const pz of prizes) {
    const pos = getPrizePos(pz);
    if (!pos || !posDomain.has(pos)) continue;
    if (hasPosFilter && pos !== posFilter) continue;

    if (hasGrupo) {
      const g = getPrizeGrupo(pz);
      if (g !== gSel) continue;
    }

    c += 1;
  }
  return c;
}

/**
 * ✅ OPÇÃO B (insight) — original (apenas quando NÃO há selectedGrupo):
 * - Se posicao=Todos: mostra Top 1 animal por posição (1º..7º)
 * - Se posicao=1º (ou outro): mostra Top 10 animais daquela posição
 *
 * ✅ IMPORTANTE:
 * - Aqui deve obedecer filtros locais, então recebe drawsForView (não o global).
 */
function buildPosAnimalRanking(draws, expectedPositions, selectedPosOrNull) {
  const safeDraws = Array.isArray(draws) ? draws : [];

  const posList =
    Array.isArray(expectedPositions) && expectedPositions.length
      ? expectedPositions.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
      : [1, 2, 3, 4, 5, 6, 7];

  const map = new Map();
  for (const p of posList) map.set(p, new Map());

  const pickPrizeAnimalLabel = (prize) => {
    if (!prize) return "";

    const grupo =
      prize?.grupo ??
      prize?.group ??
      prize?.grupo1 ??
      prize?.grupo_1 ??
      prize?.g ??
      null;

    const animal =
      prize?.animal ??
      prize?.animal2 ??
      prize?.bicho ??
      prize?.nome ??
      prize?.name ??
      prize?.an ??
      null;

    let label = "";
    try {
      label = getAnimalLabel({ grupo, animal });
    } catch {
      label = "";
    }

    const base = String(label || animal || grupo || "").trim();
    return base ? base.toUpperCase() : "";
  };

  for (const d of safeDraws) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
    for (const pz of prizes) {
      const pos = getPrizePos(pz);
      if (!pos) continue;

      if (selectedPosOrNull && pos !== selectedPosOrNull) continue;
      if (!map.has(pos)) continue;

      const aLabel = pickPrizeAnimalLabel(pz);
      if (!aLabel) continue;

      const posMap = map.get(pos);
      posMap.set(aLabel, (posMap.get(aLabel) || 0) + 1);
    }
  }

  // tie-break estável: value desc, label asc
  const sortStable = (a, b) => {
    const dv = safeNumber(b.value) - safeNumber(a.value);
    if (dv !== 0) return dv;
    return String(a.label || "").localeCompare(String(b.label || ""), "pt-BR");
  };

  if (selectedPosOrNull) {
    const m = map.get(selectedPosOrNull) || new Map();
    const items = Array.from(m.entries())
      .map(([label, value]) => ({ label, value }))
      .sort(sortStable)
      .slice(0, 10);

    return {
      mode: "single",
      header: `Top animais — ${prettyPosLabel(selectedPosOrNull)}`,
      items,
    };
  }

  const out = [];
  for (const pos of posList) {
    const m = map.get(pos) || new Map();
    const sorted = Array.from(m.entries())
      .map(([label, value]) => ({ label, value }))
      .sort(sortStable);

    const top = sorted[0] || null;
    if (!top) {
      out.push({ pos, animal: "—", value: 0 });
      continue;
    }
    out.push({ pos, animal: top.label, value: top.value });
  }

  return {
    mode: "all",
    header: "Top animal por posição",
    items: out,
  };
}

/**
 * ✅ GLOBAL: aparições por grupo (01..25), IGNORANDO filtros e selectedGrupo
 * - Conta cada prize como 1 aparição
 * - Restringe domínio de posições 1..7 (coerência)
 * - ✅ NÃO REMOVE ZEROS: retorna SEMPRE os 25 bichos (não pode sumir nenhum)
 */
function buildGlobalAparicoes25(drawsAll) {
  const safeDraws = Array.isArray(drawsAll) ? drawsAll : [];
  const map = new Map(); // grupo -> count

  for (const d of safeDraws) {
    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
    for (const pz of prizes) {
      const pos = getPrizePos(pz);
      if (!pos || pos < 1 || pos > 7) continue;

      const g = getPrizeGrupo(pz);
      if (!g || g < 1 || g > 25) continue;

      map.set(g, (map.get(g) || 0) + 1);
    }
  }

  const items = [];
  for (let g = 1; g <= 25; g += 1) {
    let labelPremium = "";
    try {
      labelPremium = String(getAnimalLabel({ grupo: g, animal: "" }) || "").trim();
    } catch {
      labelPremium = "";
    }

    const label = String(labelPremium || `Grupo ${String(g).padStart(2, "0")}`)
      .trim()
      .toUpperCase();

    items.push({ grupo: g, label, value: map.get(g) || 0 });
  }
  // ✅ Ordem fixa 01..25 (não muda leitura com empates/variações)
  items.sort((a, b) => safeNumber(a.grupo) - safeNumber(b.grupo));
  return items;
}

/* =========================
   PREMIUM UI TOKENS
========================= */

const PP = {
  appBg: "#000000",
  surface: "#0B0B0C",
  surface2: "#0F0F12",

  stroke: "rgba(255,255,255,0.14)",
  strokeStrong: "rgba(255,255,255,0.22)",

  gold: "#B89E47",
  goldGlow: "rgba(200,178,90,0.18)",

  text: "rgba(255,255,255,0.92)",
  text2: "rgba(255,255,255,0.78)",
  muted: "rgba(255,255,255,0.55)",

  rCard: 18,
  rInner: 14,

  shadowCard: "0 14px 40px rgba(0,0,0,0.55)",
  shadowGlow: "0 0 0 1px rgba(200,178,90,0.10), 0 18px 50px rgba(0,0,0,0.55)",

  titleSize: 16,
  titleWeight: 800,
  labelSize: 13,
  labelWeight: 650,

  gap: 14,

  hairline: "rgba(184,158,71,0.45)",
  goldStroke: "rgba(200,178,90,0.38)",
};

/* =========================
   Card / Empty
========================= */

function Card({ title, right, children }) {
  return (
    <section style={ui.card}>
      <div aria-hidden="true" style={ui.cardGoldHairline} />
      <div aria-hidden="true" style={ui.cardCornerGlow} />

      <header style={ui.cardHeader}>
        <div style={ui.cardTitle} title={title}>
          {title}
        </div>
        {right ? <div style={ui.cardRight}>{right}</div> : null}
      </header>

      <div style={ui.cardBody}>
        <div style={ui.innerFrame}>{children}</div>
      </div>
    </section>
  );
}

function EmptyState({ label }) {
  return (
    <div style={ui.emptyWrap}>
      <div style={ui.emptyGrid} />
      <div style={ui.emptyShine} />
      {label ? <div style={ui.emptyLabel}>{label}</div> : null}
    </div>
  );
}

/* =========================
   SVG charts (sem libs) — fill card
========================= */

function calcMonthViewH(rows) {
  const r = Math.max(1, Number(rows || 0));
  const base = 110;
  const perRow = 34;
  const H = base + r * perRow;
  return clamp(H, 340, 620);
}

function BarChartHorizontalMonthPremium({ data }) {
  const W = 900;
  const safeData = Array.isArray(data) ? data : [];
  const rows = Math.max(1, safeData.length);
  const H = calcMonthViewH(rows);

  const pad = { l: 18, r: 18, t: 18, b: 18 };
  const labelCol = 118;
  const valueCol = 72;

  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const barAreaW = Math.max(10, innerW - labelCol - valueCol);
  const rowGap = 10;
  const rowH = (innerH - rowGap * (rows - 1)) / rows;
  const barH = clamp(rowH * 0.76, 16, 30);

  const max = Math.max(0, ...safeData.map((d) => safeNumber(d.value)));

  return (
    <div style={{ ...ui.svgFill, height: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}>
        {safeData.map((d, i) => {
          const v = safeNumber(d.value);
          const pct = max > 0 ? v / max : 0;

          const rowTop = pad.t + i * (rowH + rowGap);
          const cy = rowTop + rowH / 2;

          const xLabel = pad.l;
          const xBar = pad.l + labelCol;
          const xVal = xBar + barAreaW + 10;

          const fillW = Math.max(0, barAreaW * pct);

          return (
            <g key={`${d.label}-${i}`}>
              <text
                x={xLabel + 2}
                y={cy + 5}
                textAnchor="start"
                fontSize="14"
                fontWeight="750"
                fill={PP.text}
                opacity="0.92"
              >
                {String(d.label)}
              </text>

              {fillW > 0 ? (
                <rect x={xBar} y={cy - barH / 2} width={fillW} height={barH} rx="10" fill={PP.gold} />
              ) : (
                <rect
                  x={xBar}
                  y={cy - barH / 2}
                  width={Math.max(6, barAreaW * 0.03)}
                  height={barH}
                  rx="10"
                  fill="rgba(255,255,255,0.10)"
                />
              )}

              {v > 0 ? (
                <text
                  x={xVal + valueCol - 2}
                  y={cy + 5}
                  textAnchor="end"
                  fontSize="14"
                  fontWeight="850"
                  fill={PP.text}
                >
                  {fmtIntPT(v)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarChartHorizontalBasic({
  data,
  labelCol = 170,
  valueCol = 92,
  barHMin = 16,
  barHCap = 44,
  onBarClick = null,
  compact = false,
}) {
  const W = 900;
  const safeData = Array.isArray(data) ? data : [];
  const rows = Math.max(1, safeData.length);

  const H = compact ? clamp(92 + rows * 34, 240, 360) : clamp(110 + rows * 44, 240, 520);

  const pad = { l: 22, r: 18, t: 16, b: 16 };

  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const barAreaW = Math.max(10, innerW - labelCol - valueCol);

  const rowGap = compact ? 8 : 10;
  const rowH = (innerH - rowGap * (rows - 1)) / rows;

  const barHMax = clamp(rowH * (compact ? 0.88 : 0.9), Math.max(12, barHMin - 2), barHCap);
  const barH = clamp(rowH * (compact ? 0.72 : 0.74), Math.max(12, barHMin - 2), barHMax);

  const max = Math.max(0, ...safeData.map((d) => safeNumber(d.value)));
  const clickable = typeof onBarClick === "function";

  const fontLabel = compact ? 12 : 13;
  const fontVal = compact ? 12 : 13;

  return (
    <div style={{ ...ui.svgFill, height: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}>
        {safeData.map((d, i) => {
          const v = safeNumber(d.value);
          const pct = max > 0 ? v / max : 0;

          const rowTop = pad.t + i * (rowH + rowGap);
          const cy = rowTop + rowH / 2;

          const xLabel = pad.l;
          const xBar = pad.l + labelCol;
          const xVal = xBar + barAreaW + 10;

          const fillW = Math.max(0, barAreaW * pct);

          const handleClick = () => {
            if (!clickable) return;
            onBarClick(d, i);
          };

          return (
            <g
              key={`${d.label}-${i}`}
              style={clickable ? { cursor: "pointer" } : undefined}
              onClick={handleClick}
            >
              <text
                x={xLabel + 2}
                y={cy + 4}
                textAnchor="start"
                fontSize={fontLabel}
                fontWeight="700"
                fill={PP.text}
                opacity="0.90"
              >
                {String(d.label)}
              </text>

              {fillW > 0 ? (
                <rect x={xBar} y={cy - barH / 2} width={fillW} height={barH} rx="10" fill={PP.gold} />
              ) : (
                <rect
                  x={xBar}
                  y={cy - barH / 2}
                  width={Math.max(6, barAreaW * 0.03)}
                  height={barH}
                  rx="10"
                  fill="rgba(255,255,255,0.10)"
                />
              )}

              <text
                x={xVal + valueCol - 2}
                y={cy + 4}
                textAnchor="end"
                fontSize={fontVal}
                fontWeight="850"
                fill={PP.text}
              >
                {fmtIntPT(v)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function WaterfallHourChart({ data }) {
  const W = 900;
  const safe = Array.isArray(data) ? data : [];
  if (!safe.length) return null;

  const H = 320;
  const pad = { l: 24, r: 18, t: 22, b: 54 };

  const last = safe[safe.length - 1];
  const hasTotal = String(last?.label || "").toLowerCase() === "total";

  const steps = hasTotal ? safe.slice(0, -1) : safe.slice(0);
  const totalVal = hasTotal ? safeNumber(last?.value) : steps.reduce((a, x) => a + safeNumber(x.value), 0);

  // ✅ Se só tiver "Total" ou total 0, não desenha
  if (!steps.length || totalVal <= 0) return null;

  const n = steps.length + (hasTotal ? 1 : 0);
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const gap = clamp(innerW * 0.02, 12, 22);
  const barW = (innerW - gap * (n - 1)) / n;

  let cum = 0;
  const cumMax = steps.reduce((max, x) => {
    cum += safeNumber(x.value);
    return Math.max(max, cum);
  }, 0);

  const scaleMax = Math.max(1, Math.max(cumMax, totalVal));
  const yBase = pad.t + innerH;

  let acc = 0;

  return (
    <div style={{ ...ui.svgFill, height: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: "block" }}>
        {[0.25, 0.5, 0.75].map((k) => {
          const y = pad.t + innerH * k;
          return (
            <line
              key={k}
              x1={pad.l}
              x2={pad.l + innerW}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
          );
        })}

        {steps.map((d, i) => {
          const v = safeNumber(d.value);
          const x = pad.l + i * (barW + gap);

          const y0 = yBase - (acc / scaleMax) * innerH;
          const y1 = yBase - ((acc + v) / scaleMax) * innerH;

          const h = Math.max(10, y0 - y1);
          const y = y1;

          acc += v;

          return (
            <g key={`${d.label}-${i}`}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx="12"
                fill={PP.gold}
                stroke={PP.goldStroke}
                strokeWidth="1"
                style={{ filter: "drop-shadow(0 10px 20px rgba(0,0,0,0.45))" }}
              />

              <text x={x + barW / 2} y={y - 10} textAnchor="middle" fontSize="14" fontWeight="900" fill={PP.text}>
                {fmtIntPT(v)}
              </text>

              <text x={x + barW / 2} y={H - 18} textAnchor="middle" fontSize="13" fontWeight="750" fill={PP.text2}>
                {String(d.label)}
              </text>
            </g>
          );
        })}

        {hasTotal ? (() => {
          const i = steps.length;
          const x = pad.l + i * (barW + gap);

          const y = yBase - (totalVal / scaleMax) * innerH;
          const h = Math.max(12, yBase - y);

          return (
            <g key="total">
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx="12"
                fill={PP.gold}
                stroke="rgba(255,255,255,0.20)"
                strokeWidth="1"
                style={{ filter: "drop-shadow(0 12px 26px rgba(0,0,0,0.55))" }}
              />

              <text x={x + barW / 2} y={y - 10} textAnchor="middle" fontSize="15" fontWeight="950" fill={PP.text}>
                {fmtIntPT(totalVal)}
              </text>

              <text x={x + barW / 2} y={H - 18} textAnchor="middle" fontSize="13" fontWeight="900" fill={PP.text2}>
                Total
              </text>
            </g>
          );
        })() : null}
      </svg>
    </div>
  );
}

/* =========================
   Aparições (list) — SCROLL (GLOBAL)
========================= */

function AparicoesList({ items }) {
  const safeItems = Array.isArray(items) ? items : [];

  // ✅ Se tudo for 0, max precisa ser 1 para não gerar NaN/Infinity
  const max = Math.max(1, ...safeItems.map((x) => safeNumber(x.value)));

  return (
    <div style={ui.scrollWrap} className="pp_scroll">
      <div style={ui.apList}>
        {safeItems.map((x, idx) => {
          const pct = (safeNumber(x.value) / max) * 100;

          return (
            <div key={`${x.grupo ?? x.label}-${idx}`} style={ui.apRow}>
              <div style={ui.apName} title={x.label}>
                {x.label}
              </div>

              <div style={ui.apBarWrap}>
                <div style={ui.apBarBg} />
                <div style={{ ...ui.apBarFill, width: `${pct}%` }} />
              </div>

              <div style={ui.apVal}>{fmtIntPT(x.value)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================
   Posição — UI
========================= */

function PosicaoRanking({ model, onPickPos, emptyLabel, disabled = false }) {
  if (!model) return null;

  const clickable = !disabled && typeof onPickPos === "function";

  // ✅ MODE: distribuição do grupo (lista simples 1º..7º)
  if (model.mode === "dist") {
    const items = Array.isArray(model.items) ? model.items : [];
    const max = Math.max(1, ...items.map((x) => safeNumber(x.value)));

    return (
      <div style={ui.posWrap}>
        <div style={ui.posHdr}>
          <div style={ui.posHdrLeft}>
            <span style={ui.posHdrText}>{model.header}</span>
            <span style={ui.posHdrSub} title={model.animalLabel || ""}>
              {String(model.animalLabel || "—")}
            </span>
          </div>
        </div>

        {items.length ? (
          <div style={ui.posList} className="pp_poslist">
            {items.map((x, idx) => {
              const pct = (safeNumber(x.value) / max) * 100;

              return (
                <button
                  key={`${x.label}-${idx}`}
                  type="button"
                  onClick={() => (clickable ? onPickPos(String(x.label || "1º")) : null)}
                  style={{
                    ...ui.posRowBtn,
                    cursor: clickable ? "pointer" : "not-allowed",
                    opacity: clickable ? 1 : 0.72,
                  }}
                  title={clickable ? `Filtrar ${x.label}` : "Interação desativada"}
                  disabled={!clickable}
                >
                  <div style={ui.posLeft}>{String(x.label)}</div>

                  <div style={ui.posMid}>
                    <div style={ui.posBarWrap}>
                      <div style={ui.posBarBg} />
                      <div style={{ ...ui.posBarFill, width: `${pct}%` }} />
                    </div>
                  </div>

                  <div style={ui.posRight}>{fmtIntPT(x.value)}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState label={emptyLabel || ""} />
        )}

        <div style={ui.posHint}>
          {disabled ? "Interação desativada." : "Clique em uma posição para aplicar o filtro de posição."}
        </div>
      </div>
    );
  }

  // ✅ MODE original (all/single)
  if (model.mode === "all") {
    const safeItems = Array.isArray(model.items) ? model.items : [];
    const max = Math.max(1, ...safeItems.map((x) => safeNumber(x.value)));

    return (
      <div style={ui.posWrap}>
        <div style={ui.posHdr}>
          <span style={ui.posHdrText}>{model.header}</span>
        </div>

        {safeItems.length ? (
          <div style={ui.posList} className="pp_poslist">
            {safeItems.map((x) => {
              const pct = (safeNumber(x.value) / max) * 100;
              const posLabel = prettyPosLabel(x.pos);

              return (
                <button
                  key={x.pos}
                  type="button"
                  onClick={() => (clickable ? onPickPos(posLabel) : null)}
                  style={{
                    ...ui.posRowBtn,
                    cursor: clickable ? "pointer" : "not-allowed",
                    opacity: clickable ? 1 : 0.72,
                  }}
                  title={clickable ? `Ver ranking de ${posLabel}` : "Interação desativada"}
                  disabled={!clickable}
                >
                  <div style={ui.posLeft}>{posLabel}</div>

                  <div style={ui.posMid}>
                    <div style={ui.posAnimal} title={x.animal}>
                      {x.animal}
                    </div>
                    <div style={ui.posBarWrap}>
                      <div style={ui.posBarBg} />
                      <div style={{ ...ui.posBarFill, width: `${pct}%` }} />
                    </div>
                  </div>

                  <div style={ui.posRight}>{fmtIntPT(x.value)}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState label={emptyLabel || ""} />
        )}

        <div style={ui.posHint}>
          {disabled ? "Interação desativada." : "Clique em uma posição para ver o Top daquela posição no filtro."}
        </div>
      </div>
    );
  }

  const items = Array.isArray(model.items) ? model.items : [];
  const max = Math.max(1, ...items.map((x) => safeNumber(x.value)));

  return (
    <div style={ui.posWrap}>
      <div style={ui.posHdr}>
        <span style={ui.posHdrText}>{model.header}</span>
      </div>

      {items.length ? (
        <div style={ui.posList} className="pp_poslist">
          {items.map((x, idx) => {
            const pct = (safeNumber(x.value) / max) * 100;
            return (
              <div key={`${x.label}-${idx}`} style={ui.posRow}>
                <div style={ui.posAnimal} title={x.label}>
                  {x.label}
                </div>

                <div style={ui.posBarWrap}>
                  <div style={ui.posBarBg} />
                  <div style={{ ...ui.posBarFill, width: `${pct}%` }} />
                </div>

                <div style={ui.posRight}>{fmtIntPT(x.value)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState label={emptyLabel || ""} />
      )}
    </div>
  );
}

/* =========================
   Stats (APARIÇÕES)
========================= */

function computeStats({ drawsRawView, drawsRawGlobal, filters, selectedGrupo }) {
  // ✅ VIEW: dedupe do recorte visual (obedece filtros locais)
  const drawsView = dedupeDraws(drawsRawView);

  // ✅ GLOBAL: dedupe do dataset global do período (ignora filtros locais)
  const drawsGlobal = dedupeDraws(drawsRawGlobal);

  const gSel = Number(selectedGrupo);
  const hasSelected = Number.isFinite(gSel) && gSel >= 1 && gSel <= 25;

  // Domínio de posições esperado (UI) — APENAS para os gráficos filtrados
  const expectedPositions = parseExpectedPositionsFromFilters(filters);
  const selectedPosOrNull = normalizePosFilter(filters);

  // ✅ Se houver seleção: recorta apenas draws VIEW onde o grupo aparece (qualquer posição)
  const draws = hasSelected ? drawsView.filter((d) => drawHasGrupo(d, gSel)) : drawsView;

  // Detecta se há múltiplos anos no recorte (para rotular como "agregado")
  const yearsSet = new Set();
  for (const d of draws) {
    const ymd = getDrawDate(d);
    if (!ymd) continue;
    const y = Number(ymd.slice(0, 4));
    if (Number.isFinite(y) && y > 1900) yearsSet.add(y);
  }
  const isMultiYear = yearsSet.size > 1;

  const monthOrder = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  // ✅ total de APARIÇÕES no recorte VIEW (para "has data" dos gráficos)
  let totalAparicoesNoRecorte = 0;
  for (const d of draws) {
    totalAparicoesNoRecorte += countAparicoesInDraw(d, {
      selectedGrupo: hasSelected ? gSel : null,
      selectedPosOrNull,
      expectedPositions,
    });
  }

  // ===== meses (APARIÇÕES) =====
  const monthMap = new Map();
  for (const d of draws) {
    const ymd = getDrawDate(d);
    const m = ymd ? getMonthPT(ymd) : null;
    if (!m) continue;

    const apar = countAparicoesInDraw(d, {
      selectedGrupo: hasSelected ? gSel : null,
      selectedPosOrNull,
      expectedPositions,
    });

    monthMap.set(m, (monthMap.get(m) || 0) + apar);
  }

  // ✅ estabilidade visual: sempre 12 meses
  const monthDataDisplay = monthOrder.map((m) => ({
    label: m,
    value: monthMap.get(m) || 0,
  }));

  // ===== dia da semana (APARIÇÕES) =====
  const wdOrder = [
    { key: "Dom", label: "domingo" },
    { key: "Seg", label: "segunda-feira" },
    { key: "Ter", label: "terça-feira" },
    { key: "Qua", label: "quarta-feira" },
    { key: "Qui", label: "quinta-feira" },
    { key: "Sex", label: "sexta-feira" },
    { key: "Sáb", label: "sábado" },
  ];

  const wdMap = new Map(wdOrder.map((k) => [k.key, 0]));

  for (const d of draws) {
    const ymd = getDrawDate(d);
    if (!ymd) continue;

    const [y, m, dd] = ymd.split("-").map(Number);
    if (!y || !m || !dd) continue;

    const dt = new Date(Date.UTC(y, m - 1, dd));
    const w = dt.getUTCDay();
    const map = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const wd = map[w] || null;
    if (!wd) continue;

    const apar = countAparicoesInDraw(d, {
      selectedGrupo: hasSelected ? gSel : null,
      selectedPosOrNull,
      expectedPositions,
    });

    wdMap.set(wd, (wdMap.get(wd) || 0) + apar);
  }

  const weekdayData = wdOrder.map((it) => ({
    label: it.label,
    value: wdMap.get(it.key) || 0,
  }));

  // ===== horário (APARIÇÕES por BUCKET) + Total =====
  const ALLOWED_BUCKETS = ["09h", "11h", "14h", "16h", "18h", "21h"];
  const hourMap = new Map(ALLOWED_BUCKETS.map((b) => [b, 0]));
  let aparicoesComHoraTotal = 0;

  for (const d of draws) {
    const bucket = hhmmToBucket09h(getDrawCloseHour(d));
    if (!bucket) continue;
    if (!hourMap.has(bucket)) continue;

    const apar = countAparicoesInDraw(d, {
      selectedGrupo: hasSelected ? gSel : null,
      selectedPosOrNull,
      expectedPositions,
    });

    hourMap.set(bucket, (hourMap.get(bucket) || 0) + apar);
    aparicoesComHoraTotal += apar;
  }

  const hourData = ALLOWED_BUCKETS.map((label) => ({
    label,
    value: hourMap.get(label) || 0,
  })).filter((x) => safeNumber(x.value) > 0);

  const hourDataWithTotal =
    hourData.length > 0 && aparicoesComHoraTotal > 0
      ? [...hourData, { label: "Total", value: aparicoesComHoraTotal }]
      : [];

  // ===== posições =====
  let posRankingModel = null;
  let selectedAnimalLabel = null;

  if (hasSelected) {
    try {
      selectedAnimalLabel = String(getAnimalLabel({ grupo: gSel, animal: "" }) || "").trim();
    } catch {
      selectedAnimalLabel = "";
    }
    if (!selectedAnimalLabel) selectedAnimalLabel = `Grupo ${String(gSel).padStart(2, "0")}`;

    const grpCount = countGrupoAparicoes(draws, gSel, expectedPositions);

    posRankingModel = {
      mode: "dist",
      header: "Aparições do animal por posição",
      animalLabel: String(selectedAnimalLabel || "").toUpperCase(),
      items: grpCount.byPos,
    };
  } else {
    // ✅ POSIÇÃO deve obedecer filtros locais -> usa drawsView (não o global)
    posRankingModel = buildPosAnimalRanking(drawsView, expectedPositions, selectedPosOrNull);
  }

  // ===== GLOBAL (card) — SEMPRE 25 itens, ignora filtros =====
  const aparicoesGlobal25 = buildGlobalAparicoes25(drawsGlobal);

  return {
    totalAparicoesNoRecorte,
    isMultiYear,

    monthDataDisplay,
    weekdayData,
    hourData: hourDataWithTotal,

    expectedPositions,
    selectedPosOrNull,
    posRankingModel,

    hasSelected,
    selectedAnimalLabel,

    aparicoesGlobal25,
  };
}

export default function ChartsGrid({
  drawsRaw, // ✅ VIEW (filtrado)
  drawsRawGlobal = null, // ✅ GLOBAL (sem filtros) — novo
  rankingData, // compat (não usado no card global)
  rankingMeta, // compat
  filters,
  loading = false,
  error = null,
  selectedGrupo = null,
  onSelectPosicao,

  // ✅ opcional
  disabledInteractions = false,
}) {
  const stats = useMemo(() => {
    const global = Array.isArray(drawsRawGlobal) ? drawsRawGlobal : drawsRaw; // fallback seguro
    return computeStats({ drawsRawView: drawsRaw, drawsRawGlobal: global, filters, selectedGrupo });
  }, [drawsRaw, drawsRawGlobal, filters, selectedGrupo]);

  const emptyLabel = useMemo(() => {
    if (loading) return "Carregando…";
    if (error) return "Falha ao carregar";
    return "Nenhum registro no recorte atual";
  }, [loading, error]);

  // ✅ Presença de dados (gráficos) baseada em APARIÇÕES no recorte (VIEW)
  const hasDataForView = stats.totalAparicoesNoRecorte > 0;

  const posBadge = useMemo(() => {
    if (!hasDataForView) return null;

    if (disabledInteractions) return "Interação desativada";
    if (stats.hasSelected) return "Clique para filtrar";
    if (stats.selectedPosOrNull) return `Filtro: ${prettyPosLabel(stats.selectedPosOrNull)}`;
    return "Clique para filtrar";
  }, [hasDataForView, disabledInteractions, stats.hasSelected, stats.selectedPosOrNull]);

  const monthTitle = useMemo(() => {
    return "Quantidade de Aparições por Mês";
  }, []);

  const canPickPos = !disabledInteractions && typeof onSelectPosicao === "function";

  return (
    <>
      <style>{ui._styleTag}</style>

      <div className="pp_charts_grid_model" style={ui.grid}>
        <div className="pp_area_month" style={ui.areaMonth}>
          <Card title={monthTitle}>
            {loading || error || !hasDataForView ? (
              <EmptyState label={emptyLabel} />
            ) : (
              <BarChartHorizontalMonthPremium data={stats.monthDataDisplay} />
            )}
          </Card>
        </div>

        <div className="pp_area_aparicoes" style={ui.areaAparicoes}>
          <Card title="Quantidade de Aparições">
            {loading || error || !Array.isArray(stats.aparicoesGlobal25) || !stats.aparicoesGlobal25.length ? (
              <EmptyState label={emptyLabel} />
            ) : (
              <AparicoesList items={stats.aparicoesGlobal25} />
            )}
          </Card>
        </div>

        <div className="pp_area_horario" style={ui.areaHorario}>
          <Card title="Quantidade de Aparições por Horário">
            {loading || error || !hasDataForView || !stats.hourData.length ? (
              <EmptyState label={emptyLabel} />
            ) : (
              <WaterfallHourChart data={stats.hourData} />
            )}
          </Card>
        </div>

        <div className="pp_area_diaSemana" style={ui.areaDiaSemana}>
          <Card title="Quantidade de Aparições por Dia da Semana">
            {loading || error || !hasDataForView ? (
              <EmptyState label={emptyLabel} />
            ) : (
              <BarChartHorizontalBasic data={stats.weekdayData} labelCol={220} valueCol={110} compact />
            )}
          </Card>
        </div>

        <div className="pp_area_posicao" style={ui.areaPosicao}>
          <Card
            title="Aparições por Posição (Ranking)"
            right={posBadge ? <span style={ui.badge}>{posBadge}</span> : null}
          >
            {loading || error || !hasDataForView ? (
              <EmptyState label={emptyLabel} />
            ) : (
              <PosicaoRanking
                model={stats.posRankingModel}
                emptyLabel={emptyLabel}
                disabled={!canPickPos}
                onPickPos={canPickPos ? (posLabel) => onSelectPosicao(String(posLabel || "1º")) : null}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/* =========================
   UI (premium)
========================= */

const ui = {
  grid: {
    display: "grid",
    gap: PP.gap,
    gridTemplateColumns: "5fr 4fr 3fr",
    gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)",
    gridTemplateAreas: `
      "month aparicoes horario"
      "month diaSemana posicao"
    `,
    alignItems: "stretch",
    height: "100%",
    minHeight: 0,
    minWidth: 0,
  },

  areaMonth: { gridArea: "month", minHeight: 0, minWidth: 0 },
  areaAparicoes: { gridArea: "aparicoes", minHeight: 0, minWidth: 0 },
  areaHorario: { gridArea: "horario", minHeight: 0, minWidth: 0 },
  areaDiaSemana: { gridArea: "diaSemana", minHeight: 0, minWidth: 0 },
  areaPosicao: { gridArea: "posicao", minHeight: 0, minWidth: 0 },

  card: {
    border: `1px solid ${PP.strokeStrong}`,
    borderRadius: PP.rCard,
    background: `linear-gradient(180deg, ${PP.surface}, ${PP.surface2})`,
    padding: 14,
    position: "relative",
    overflow: "hidden",
    boxShadow: PP.shadowGlow,
    height: "100%",
    minHeight: 0,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    color: PP.text,
  },

  cardGoldHairline: {
    position: "absolute",
    left: 12,
    right: 12,
    top: 10,
    height: 1,
    background: `linear-gradient(90deg, transparent, ${PP.hairline}, transparent)`,
    opacity: 0.9,
    pointerEvents: "none",
  },

  cardCornerGlow: {
    position: "absolute",
    width: 260,
    height: 180,
    right: -80,
    top: -80,
    background: "radial-gradient(closest-side, rgba(200,178,90,0.14), transparent 62%)",
    filter: "blur(2px)",
    opacity: 0.9,
    pointerEvents: "none",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottom: `1px solid ${PP.stroke}`,
    flex: "0 0 auto",
    minWidth: 0,
  },

  cardTitle: {
    fontWeight: PP.titleWeight,
    letterSpacing: 0.2,
    fontSize: PP.titleSize,
    color: PP.text,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
  },

  cardRight: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: "0 0 auto",
  },

  badge: {
    display: "inline-flex",
    alignItems: "center",
    height: 24,
    padding: "0 10px",
    borderRadius: 999,
    border: `1px solid ${PP.stroke}`,
    background: "rgba(0,0,0,0.35)",
    color: PP.text2,
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  },

  cardBody: {
    position: "relative",
    flex: "1 1 auto",
    minHeight: 0,
    minWidth: 0,
    display: "flex",
  },

  innerFrame: {
    height: "100%",
    width: "100%",
    minHeight: 0,
    minWidth: 0,
    borderRadius: PP.rInner,
    border: `1px solid ${PP.stroke}`,
    background:
      "radial-gradient(1000px 360px at 20% 10%, rgba(255,255,255,0.06), transparent 55%), linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
    overflow: "hidden",
    position: "relative",
    display: "flex",
  },

  svgFill: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: 10,
    display: "flex",
  },

  scrollWrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflowY: "auto",
    padding: 12,
  },

  apList: { display: "grid", gap: 10, minWidth: 0 },

  apRow: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 64px",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  apName: {
    fontWeight: 750,
    fontSize: 13,
    letterSpacing: 0.12,
    color: PP.text,
    opacity: 0.92,
    lineHeight: 1.05,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  apBarWrap: {
    position: "relative",
    height: 18,
    borderRadius: 10,
    overflow: "hidden",
    minWidth: 0,
    border: `1px solid rgba(255,255,255,0.10)`,
    background: "rgba(255,255,255,0.04)",
  },

  apBarBg: {
    position: "absolute",
    inset: 0,
    background: "rgba(255,255,255,0.05)",
  },

  apBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    background: PP.gold,
    boxShadow: `0 0 0 1px rgba(200,178,90,0.14)`,
  },

  apVal: {
    textAlign: "right",
    fontWeight: 850,
    fontSize: 13,
    letterSpacing: 0.1,
    color: PP.text,
    opacity: 0.92,
    lineHeight: 1.05,
  },

  posWrap: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  posHdr: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingBottom: 8,
    borderBottom: `1px solid rgba(255,255,255,0.10)`,
    minWidth: 0,
  },

  posHdrLeft: {
    display: "grid",
    gap: 4,
    minWidth: 0,
  },

  posHdrText: {
    fontWeight: 850,
    fontSize: 13,
    letterSpacing: 0.18,
    color: PP.text,
    opacity: 0.92,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  posHdrSub: {
    fontWeight: 850,
    fontSize: 12,
    letterSpacing: 0.14,
    color: PP.text2,
    opacity: 0.88,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  posList: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gap: 10,
    overflowY: "auto",
    paddingRight: 2,
  },

  posRowBtn: {
    width: "100%",
    textAlign: "left",
    border: `1px solid rgba(255,255,255,0.12)`,
    background: "rgba(0,0,0,0.30)",
    borderRadius: 12,
    padding: 10,
    display: "grid",
    gridTemplateColumns: "56px 1fr 64px",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    color: PP.text,
  },

  posRow: {
    border: `1px solid rgba(255,255,255,0.12)`,
    background: "rgba(0,0,0,0.30)",
    borderRadius: 12,
    padding: 10,
    display: "grid",
    gridTemplateColumns: "1fr 1fr 64px",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },

  posLeft: {
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.2,
    color: PP.text2,
    opacity: 0.9,
  },

  posMid: { minWidth: 0, display: "grid", gap: 6 },

  posAnimal: {
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.16,
    color: PP.text,
    opacity: 0.92,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  posBarWrap: {
    position: "relative",
    height: 14,
    borderRadius: 10,
    overflow: "hidden",
    minWidth: 0,
    border: `1px solid rgba(255,255,255,0.10)`,
    background: "rgba(255,255,255,0.04)",
  },

  posBarBg: {
    position: "absolute",
    inset: 0,
    background: "rgba(255,255,255,0.05)",
  },

  posBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    background: PP.gold,
    boxShadow: `0 0 0 1px rgba(200,178,90,0.14)`,
  },

  posRight: {
    textAlign: "right",
    fontWeight: 900,
    fontSize: 12,
    letterSpacing: 0.12,
    color: PP.text,
    opacity: 0.92,
  },

  posHint: {
    fontSize: 11,
    color: PP.muted,
    letterSpacing: 0.12,
    opacity: 0.9,
  },

  emptyWrap: {
    position: "relative",
    width: "100%",
    height: "100%",
    background: "rgba(0,0,0,0.10)",
    overflow: "hidden",
    flex: 1,
  },

  emptyGrid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
    backgroundSize: "32px 32px",
    opacity: 0.16,
  },

  emptyShine: {
    position: "absolute",
    inset: 0,
    background: "radial-gradient(700px 260px at 20% 20%, rgba(200,178,90,0.14), transparent 60%)",
    opacity: 0.55,
    pointerEvents: "none",
  },

  emptyLabel: {
    position: "absolute",
    left: 12,
    bottom: 10,
    fontWeight: 800,
    opacity: 0.82,
    fontSize: 12,
    letterSpacing: 0.2,
    color: PP.text,
    textShadow: "0 2px 10px rgba(0,0,0,0.55)",
    pointerEvents: "none",
  },

  _styleTag: `
  .pp_charts_grid_model * { box-sizing: border-box; }

  /* Scroll premium (card Aparições - GLOBAL) */
  .pp_scroll::-webkit-scrollbar { width: 10px; }
  .pp_scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 999px; }
  .pp_scroll::-webkit-scrollbar-thumb { background: rgba(200,178,90,0.35); border-radius: 999px; border: 2px solid rgba(0,0,0,0.35); }
  .pp_scroll::-webkit-scrollbar-thumb:hover { background: rgba(200,178,90,0.48); }

  /* Pos list scroll premium */
  .pp_poslist::-webkit-scrollbar { width: 10px; }
  .pp_poslist::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); border-radius: 999px; }
  .pp_poslist::-webkit-scrollbar-thumb { background: rgba(200,178,90,0.30); border-radius: 999px; border: 2px solid rgba(0,0,0,0.35); }

  @media (max-width: 1200px){
    .pp_charts_grid_model{
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto;
      grid-template-areas:
        "month month"
        "aparicoes horario"
        "diaSemana diaSemana"
        "posicao posicao";
    }
  }

  @media (max-width: 720px){
    .pp_charts_grid_model{
      grid-template-columns: 1fr;
      grid-template-areas:
        "month"
        "aparicoes"
        "horario"
        "diaSemana"
        "posicao";
    }
  }
  `,
};

