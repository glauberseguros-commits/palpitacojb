// src/utils/buildPalpites.js
/**
 * ============================================================
 * buildPalpite (PalPitaco) — V1 (Opção C) [FECHADO]
 * ============================================================
 *
 * Objetivo:
 * - Gerar palpite 4 dígitos ("milhar") POR GRUPO (01..25)
 *
 * Regras (NÃO ALTERAR sem recalibração):
 * - Usa amostra mínima do HORÁRIO-ALVO (bucket) quando informado
 * - Baseia-se SOMENTE nos draws mais recentes
 *
 * Critérios:
 * - Dezena: mais frequente
 * - Empate: mais recente (lastSeen)
 * - Milhar/Centena: mais frequente entre números que terminam na dezena
 * - Empate: mais recente
 *
 * Contrato:
 * - Não inventa dados
 * - Não força minDraws se a base não tiver
 * - Deduplica draws para evitar inflação estatística
 * ============================================================
 *
 * ============================================================
 * buildPalpiteV2 — (NOVO) Palpite por FREQUÊNCIA + ANTIGUIDADE
 * ============================================================
 *
 * Objetivo (conforme combinado AGORA):
 * - Gerar palpite 4 dígitos ("milhar") POR GRUPO (01..25)
 * - Respeitar o RECORTE ATUAL (global ou filtrado), sem janela "mais recente"
 *
 * Critérios:
 * - Dezena: mais frequente
 * - Empate: mais ANTIGA (primeira aparição no tempo)
 * - Unidade de centena (3º dígito da direita): mais frequente
 * - Empate: mais ANTIGA
 * - Unidade de milhar (4º dígito da direita): mais frequente
 * - Empate: mais ANTIGA
 *
 * Montagem:
 * - palpite = [milharDigit][centenaDigit][dezena(2)]
 *
 * Contrato:
 * - Deduplica draws para evitar inflação estatística
 * - Não inventa dados: se não houver números no recorte, retorna null para o grupo
 * ============================================================
 */

function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeDigitsOnly(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.replace(/\D+/g, "");
}

function toMilhar4(input) {
  const digits = normalizeDigitsOnly(input);
  if (!digits) return null;

  if (digits.length >= 4) return digits.slice(-4).padStart(4, "0");
  if (digits.length === 3) return digits.padStart(4, "0");
  if (digits.length === 2) return `00${digits}`;
  if (digits.length === 1) return `000${digits}`;
  return null;
}

function extractMilharFromPrize(prize) {
  if (!prize || typeof prize !== "object") return null;

  const CANDIDATE_KEYS = [
    "milhar",
    "thousand",
    "numero",
    "número",
    "number",
    "num",
    "resultado",
    "result",
    "valor",
    "value",
    "bilhete",
    "ticket",
  ];

  for (const k of CANDIDATE_KEYS) {
    if (prize[k] != null) {
      const m = toMilhar4(prize[k]);
      if (m) return m;
    }
  }

  const cent = prize.centena ?? prize.hundred ?? null;
  const dez = prize.dezena ?? prize.ten ?? null;

  const centDigits = normalizeDigitsOnly(cent);
  const dezDigits = normalizeDigitsOnly(dez);

  if (centDigits) {
    if (centDigits.length >= 3) return toMilhar4(centDigits.slice(-3));
    if (centDigits.length === 2) return toMilhar4(centDigits);
  }

  if (dezDigits && dezDigits.length >= 2) {
    return toMilhar4(dezDigits.slice(-2));
  }

  return null;
}

function getGrupoNumFromPrize(prize) {
  const g = prize?.grupo ?? prize?.group ?? null;
  const n = Number(g);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 25) return null;
  return n;
}

/* =========================
   Date / Hour utils
========================= */

function normalizeToYMD(input) {
  if (!input) return null;

  // Firestore Timestamp com toDate()
  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function getDrawYmd(d) {
  return normalizeToYMD(
    d?.ymd ?? d?.date ?? d?.draw_date ?? d?.close_date ?? d?.data ?? d?.dt ?? null
  );
}

function getDrawCloseHour(d) {
  return String(d?.close_hour ?? d?.closeHour ?? d?.hour ?? d?.hora ?? "").trim();
}

function toHourNum(closeHour) {
  const s = String(closeHour || "").trim();

  const mh = s.match(/^(\d{1,2})h$/i);
  if (mh) return Number(mh[1]) * 100;

  const m0 = s.match(/^(\d{1,2})$/);
  if (m0) return Number(m0[1]) * 100;

  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;

  return Number(m[1]) * 100 + Number(m[2]);
}

function toHourBucketLabel(closeHour) {
  const s = String(closeHour || "").trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2})h$/i);
  if (m1) return `${pad2(m1[1])}h`;

  const m2 = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}h`;

  const m3 = s.match(/^(\d{1,2})$/);
  if (m3) return `${pad2(m3[1])}h`;

  return null;
}

/**
 * Deduplica draws para evitar inflação estatística.
 * Prioridade:
 * - drawId / id
 * - fallback: ymd + close_hour
 */
function dedupeDraws(draws) {
  const arr = Array.isArray(draws) ? draws : [];
  if (!arr.length) return arr;

  const seen = new Set();
  const out = [];

  for (const d of arr) {
    const key =
      (d?.drawId != null && String(d.drawId)) ||
      (d?.id != null && String(d.id)) ||
      `${getDrawYmd(d) || ""}__${getDrawCloseHour(d) || ""}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }

  return out;
}

function sortDrawsChrono(draws) {
  const list = Array.isArray(draws) ? [...draws] : [];
  list.sort((a, b) => {
    const da = String(getDrawYmd(a) || "");
    const db = String(getDrawYmd(b) || "");
    if (da !== db) return da.localeCompare(db);
    return toHourNum(getDrawCloseHour(a)) - toHourNum(getDrawCloseHour(b));
  });
  return list;
}

function pickTopByFreqAndRecency(freqMap) {
  let bestKey = null;
  let bestCount = -1;
  let bestLast = -1;

  for (const [k, v] of freqMap.entries()) {
    const c = Number(v?.count || 0);
    const last = Number(v?.lastSeen || 0);

    if (c > bestCount || (c === bestCount && last > bestLast)) {
      bestKey = k;
      bestCount = c;
      bestLast = last;
    }
  }

  return bestKey;
}

/**
 * ✅ V2: desempate por ANTIGUIDADE
 * - Maior frequência vence
 * - Empate: menor firstSeen vence (mais antigo)
 */
function pickTopByFreqAndOldest(freqMap) {
  let bestKey = null;
  let bestCount = -1;
  let bestFirst = Number.POSITIVE_INFINITY;

  for (const [k, v] of freqMap.entries()) {
    const c = Number(v?.count || 0);
    const first = Number(v?.firstSeen ?? Number.POSITIVE_INFINITY);

    if (c > bestCount || (c === bestCount && first < bestFirst)) {
      bestKey = k;
      bestCount = c;
      bestFirst = first;
    }
  }

  return bestKey;
}

/**
 * ✅ Helper (fora de loops) para evitar ESLint no-loop-func
 */
function bumpFreqFirstSeen(map, key, seq) {
  if (key == null) return;
  const k = String(key);
  const cur = map.get(k) || { count: 0, firstSeen: seq };
  cur.count += 1;
  if (!Number.isFinite(Number(cur.firstSeen)) || seq < cur.firstSeen) cur.firstSeen = seq;
  map.set(k, cur);
}

/**
 * buildPalpite (V1)
 *
 * opts:
 * - closeHourBucket: "09h" | "11h" | etc
 * - minDraws: default 400
 * - maxDraws: default 2000
 */
export function buildPalpite(draws, opts = {}) {
  const closeHourBucket = opts.closeHourBucket ? String(opts.closeHourBucket).trim() : null;

  const minDraws = Number.isFinite(+opts.minDraws) ? Math.max(1, +opts.minDraws) : 400;
  const maxDraws = Number.isFinite(+opts.maxDraws) ? Math.max(minDraws, +opts.maxDraws) : 2000;

  let base = dedupeDraws(draws);

  if (closeHourBucket) {
    base = base.filter((d) => toHourBucketLabel(getDrawCloseHour(d)) === closeHourBucket);
  }

  const ordered = sortDrawsChrono(base);

  const total = ordered.length;
  const windowed = total > maxDraws ? ordered.slice(total - maxDraws) : ordered;

  const perGrupo = new Map();

  const ensure = (g) => {
    if (!perGrupo.has(g)) {
      perGrupo.set(g, { dez: new Map(), cent: new Map(), milhar: new Map() });
    }
    return perGrupo.get(g);
  };

  let seq = 0;
  for (const d of windowed) {
    seq += 1;
    for (const p of d?.prizes || []) {
      const g = getGrupoNumFromPrize(p);
      if (!g) continue;

      const milhar = extractMilharFromPrize(p);
      if (!milhar) continue;

      const holder = ensure(pad2(g));
      const dez = milhar.slice(-2);
      const cent = milhar.slice(-3);

      for (const [map, key] of [
        [holder.dez, dez],
        [holder.cent, cent],
        [holder.milhar, milhar],
      ]) {
        const cur = map.get(key) || { count: 0, lastSeen: 0 };
        cur.count += 1;
        cur.lastSeen = seq;
        map.set(key, cur);
      }
    }
  }

  const palpitesByGrupo = {};
  const debugByGrupo = {};

  for (let i = 1; i <= 25; i++) {
    const g = pad2(i);
    const h = perGrupo.get(g);

    if (!h || h.dez.size === 0) {
      palpitesByGrupo[g] = null;
      debugByGrupo[g] = { reason: "no_numbers_in_sample" };
      continue;
    }

    const dezWin = pickTopByFreqAndRecency(h.dez);
    const centFiltered = new Map([...h.cent].filter(([k]) => k.endsWith(dezWin)));
    const milharFiltered = new Map([...h.milhar].filter(([k]) => k.endsWith(dezWin)));

    const milharWin = pickTopByFreqAndRecency(milharFiltered);
    const centWin = milharWin ? null : pickTopByFreqAndRecency(centFiltered);

    const palpite = milharWin
      ? milharWin
      : centWin
      ? centWin.padStart(4, "0")
      : `00${dezWin}`.padStart(4, "0");

    palpitesByGrupo[g] = palpite;
    debugByGrupo[g] = { dezWin, milharWin, centWin };
  }

  return {
    palpitesByGrupo,
    sampleDrawsUsed: windowed.length,
    totalCandidates: ordered.length,
    usedBucket: closeHourBucket || null,
    debugByGrupo,
  };
}

/**
 * buildPalpiteV2 (NOVO)
 *
 * opts:
 * - closeHourBucket: "09h" | "11h" | etc (opcional)
 *
 * Observação:
 * - NÃO usa janela "mais recente" (usa TODO o recorte recebido).
 * - Desempate por ANTIGUIDADE (primeira aparição).
 */
export function buildPalpiteV2(draws, opts = {}) {
  const closeHourBucket = opts.closeHourBucket ? String(opts.closeHourBucket).trim() : null;

  let base = dedupeDraws(draws);

  if (closeHourBucket) {
    base = base.filter((d) => toHourBucketLabel(getDrawCloseHour(d)) === closeHourBucket);
  }

  // Cronológico para "antiguidade" ser objetiva
  const ordered = sortDrawsChrono(base);

  // Estrutura por grupo:
  // - dez: "00".."99"
  // - centDigit: "0".."9" (3º da direita)
  // - milDigit: "0".."9" (4º da direita)
  const perGrupo = new Map();

  const ensure = (g) => {
    if (!perGrupo.has(g)) {
      perGrupo.set(g, { dez: new Map(), centDigit: new Map(), milDigit: new Map() });
    }
    return perGrupo.get(g);
  };

  // seq = índice cronológico (1..N) para medir "primeira aparição"
  let seq = 0;

  for (const d of ordered) {
    seq += 1;

    const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
    for (const p of prizes) {
      const gNum = getGrupoNumFromPrize(p);
      if (!gNum) continue;

      const milhar = extractMilharFromPrize(p);
      if (!milhar) continue;

      const dez = milhar.slice(-2);
      const centDigit = milhar.slice(-3, -2); // unidade de centena
      const milDigit = milhar.slice(-4, -3); // unidade de milhar

      const holder = ensure(pad2(gNum));

      bumpFreqFirstSeen(holder.dez, dez, seq);
      bumpFreqFirstSeen(holder.centDigit, centDigit, seq);
      bumpFreqFirstSeen(holder.milDigit, milDigit, seq);
    }
  }

  const palpitesByGrupo = {};
  const debugByGrupo = {};

  for (let i = 1; i <= 25; i++) {
    const g = pad2(i);
    const h = perGrupo.get(g);

    if (!h || h.dez.size === 0) {
      palpitesByGrupo[g] = null;
      debugByGrupo[g] = { reason: "no_numbers_in_slice" };
      continue;
    }

    const dezWin = pickTopByFreqAndOldest(h.dez);
    const centDigitWin = pickTopByFreqAndOldest(h.centDigit);
    const milDigitWin = pickTopByFreqAndOldest(h.milDigit);

    if (!dezWin || centDigitWin == null || milDigitWin == null) {
      palpitesByGrupo[g] = null;
      debugByGrupo[g] = {
        reason: "incomplete_components",
        dezWin,
        centDigitWin,
        milDigitWin,
      };
      continue;
    }

    const palpite = `${String(milDigitWin)}${String(centDigitWin)}${String(dezWin)}`.padStart(
      4,
      "0"
    );

    palpitesByGrupo[g] = palpite;
    debugByGrupo[g] = { dezWin, centDigitWin, milDigitWin };
  }

  return {
    palpitesByGrupo,
    sampleDrawsUsed: ordered.length,
    totalCandidates: ordered.length,
    usedBucket: closeHourBucket || null,
    debugByGrupo,
  };
}
