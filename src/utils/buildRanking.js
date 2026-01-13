// src/utils/buildRanking.js

/**
 * buildRanking (PalPitaco)
 *
 * Padrão atual (mantido):
 * - "Aparições" = total de ocorrências por prize (posição).
 *   Ex.: se o draw tem 7 posições, pode contar até 7 ocorrências por draw.
 *
 * Opção futura (sem ativar por padrão):
 * - countMode: "byDraw" => conta no máximo 1 ocorrência por grupo dentro do mesmo draw.
 */

/* =========================
   BICHO MAP OFICIAL (01..25)
========================= */
const BICHO_MAP = [
  { grupo: 1, animal: "AVESTRUZ", slug: "avestruz", dezenas: ["01", "02", "03", "04"] },
  { grupo: 2, animal: "ÁGUIA", slug: "aguia", dezenas: ["05", "06", "07", "08"] },
  { grupo: 3, animal: "BURRO", slug: "burro", dezenas: ["09", "10", "11", "12"] },
  { grupo: 4, animal: "BORBOLETA", slug: "borboleta", dezenas: ["13", "14", "15", "16"] },
  { grupo: 5, animal: "CACHORRO", slug: "cachorro", dezenas: ["17", "18", "19", "20"] },
  { grupo: 6, animal: "CABRA", slug: "cabra", dezenas: ["21", "22", "23", "24"] },
  { grupo: 7, animal: "CARNEIRO", slug: "carneiro", dezenas: ["25", "26", "27", "28"] },
  { grupo: 8, animal: "CAMELO", slug: "camelo", dezenas: ["29", "30", "31", "32"] },
  { grupo: 9, animal: "COBRA", slug: "cobra", dezenas: ["33", "34", "35", "36"] },
  { grupo: 10, animal: "COELHO", slug: "coelho", dezenas: ["37", "38", "39", "40"] },
  { grupo: 11, animal: "CAVALO", slug: "cavalo", dezenas: ["41", "42", "43", "44"] },
  { grupo: 12, animal: "ELEFANTE", slug: "elefante", dezenas: ["45", "46", "47", "48"] },
  { grupo: 13, animal: "GALO", slug: "galo", dezenas: ["49", "50", "51", "52"] },
  { grupo: 14, animal: "GATO", slug: "gato", dezenas: ["53", "54", "55", "56"] },
  { grupo: 15, animal: "JACARÉ", slug: "jacare", dezenas: ["57", "58", "59", "60"] },
  { grupo: 16, animal: "LEÃO", slug: "leao", dezenas: ["61", "62", "63", "64"] },
  { grupo: 17, animal: "MACACO", slug: "macaco", dezenas: ["65", "66", "67", "68"] },
  { grupo: 18, animal: "PORCO", slug: "porco", dezenas: ["69", "70", "71", "72"] },
  { grupo: 19, animal: "PAVÃO", slug: "pavao", dezenas: ["73", "74", "75", "76"] },
  { grupo: 20, animal: "PERU", slug: "peru", dezenas: ["77", "78", "79", "80"] },
  { grupo: 21, animal: "TOURO", slug: "touro", dezenas: ["81", "82", "83", "84"] },
  { grupo: 22, animal: "TIGRE", slug: "tigre", dezenas: ["85", "86", "87", "88"] },
  { grupo: 23, animal: "URSO", slug: "urso", dezenas: ["89", "90", "91", "92"] },
  { grupo: 24, animal: "VEADO", slug: "veado", dezenas: ["93", "94", "95", "96"] },
  { grupo: 25, animal: "VACA", slug: "vaca", dezenas: ["97", "98", "99", "00"] },
];

const BY_GRUPO = new Map(BICHO_MAP.map((b) => [b.grupo, b]));

/* =========================
   Utils
========================= */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function normalizeAnimalLocal(a) {
  return String(a || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getOfficialByGrupo(grupoNum) {
  const g = Number(grupoNum);
  if (!Number.isFinite(g)) return null;
  const b = BY_GRUPO.get(g);
  if (!b) return null;

  return {
    grupoNum: g,
    grupo: pad2(g),
    animal: b.animal ? normalizeAnimalLocal(b.animal) : "",
    slug: b.slug || "",
    dezenas: Array.isArray(b.dezenas) ? b.dezenas.slice() : [],
  };
}

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

  // Date
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
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

function getDrawYmdRaw(d) {
  if (!d) return null;
  return d.date ?? d.ymd ?? d.draw_date ?? d.close_date ?? d.data ?? d.dt ?? null;
}

function getDrawHourRaw(d) {
  if (!d) return "";
  return String(d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? "").trim();
}

/**
 * ✅ DEDUP DE DRAWS (CORREÇÃO CRÍTICA)
 * - Prioriza a chave LÓGICA (ymd + close_hour) para eliminar duplicidade real
 * - Só cai para id/drawId se NÃO conseguir montar (ymd/hour)
 * - Se ainda assim ficar sem chave, usa fallback com índice (não colapsa tudo em "__")
 */
function dedupeDraws(draws) {
  const arr = Array.isArray(draws) ? draws : [];
  if (!arr.length) return arr;

  const seen = new Set();
  const out = [];

  for (let i = 0; i < arr.length; i += 1) {
    const d = arr[i];

    const ymd =
      String(d?.ymd || "").trim() ||
      normalizeToYMD(getDrawYmdRaw(d)) ||
      "";

    const hour = getDrawHourRaw(d);

    const logicalKey = ymd && hour ? `${ymd}__${hour}` : "";
    const fallbackKey =
      (d?.drawId != null && String(d.drawId)) ||
      (d?.id != null && String(d.id)) ||
      "";

    const key = logicalKey || fallbackKey || `${ymd || "nodate"}__${hour || "nohour"}__idx${i}`;

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }

  return out;
}

/**
 * ✅ Dedup defensivo de prizes dentro do mesmo draw
 * - prioridade: prizeId (se existir)
 * - fallback: position + grupo + animal
 * - se position vier vazio, ainda assim diferencia por "idx" para não colapsar tudo
 */
function dedupePrizes(prizes) {
  const arr = Array.isArray(prizes) ? prizes : [];
  if (!arr.length) return arr;

  const seen = new Set();
  const out = [];

  for (let i = 0; i < arr.length; i += 1) {
    const p = arr[i];

    const grupoRaw = p?.grupo ?? p?.group ?? "";
    const animalRaw = p?.animal ?? "";
    const posRaw = p?.posicao ?? p?.position ?? "";

    const baseFallback = `${String(posRaw)}__${String(grupoRaw)}__${normalizeAnimalLocal(animalRaw)}`;
    const key =
      (p?.prizeId != null && String(p.prizeId)) ||
      (String(posRaw).trim() ? baseFallback : `${baseFallback}__idx${i}`);

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }

  return out;
}

/* =========================
   Main
========================= */
export function buildRanking(draws, opts = {}) {
  // ✅ correção: dedup no nível de draws ANTES de qualquer métrica
  const list = dedupeDraws(Array.isArray(draws) ? draws : []);

  // Padrão atual (mantido): conta por prize
  const countMode = String(opts.countMode || "byPrize"); // "byPrize" | "byDraw"
  const maxIntegrityIssues = Number.isFinite(Number(opts.maxIntegrityIssues))
    ? Math.max(0, Number(opts.maxIntegrityIssues))
    : 300;

  const totalDraws = list.length;

  // metas de período
  const daySet = new Set();
  let minDate = null;
  let maxDate = null;

  for (const d of list) {
    const ymd = normalizeToYMD(getDrawYmdRaw(d));
    if (!ymd) continue;

    daySet.add(ymd);
    if (!minDate || ymd < minDate) minDate = ymd;
    if (!maxDate || ymd > maxDate) maxDate = ymd;
  }

  const uniqueDays = daySet.size;

  // ranking
  const map = new Map();
  let totalOcorrencias = 0;

  // auditoria de consistência grupo x animal
  const integrityIssues = [];

  for (const draw of list) {
    const prizes = dedupePrizes(draw?.prizes);

    // se countMode = byDraw, evitamos contar o mesmo grupo mais de 1x por draw
    const countedGroupsThisDraw = countMode === "byDraw" ? new Set() : null;

    for (const prize of prizes) {
      const grupoRaw = prize?.grupo ?? prize?.group;
      const animalRaw = prize?.animal;

      if (grupoRaw == null) continue;

      const grupoNum = Number(grupoRaw);
      if (!Number.isFinite(grupoNum)) continue;
      if (grupoNum < 1 || grupoNum > 25) continue;

      if (countedGroupsThisDraw) {
        const k = String(grupoNum);
        if (countedGroupsThisDraw.has(k)) continue;
        countedGroupsThisDraw.add(k);
      }

      const official = getOfficialByGrupo(grupoNum);
      const grupo = official?.grupo || pad2(grupoNum);

      const animalFromData = animalRaw ? normalizeAnimalLocal(animalRaw) : "";
      const animalOfficial = official?.animal || "";
      const animalLabel = animalFromData || animalOfficial || "";

      let entry = map.get(grupo);
      if (!entry) {
        entry = {
          grupo,                 // "01".."25" (string)
          grupoNum: grupoNum,    // 1..25 (number)
          animal: animalLabel,   // "GATO"
          slug: official?.slug || "",
          dezenas: official?.dezenas || [],
          total: 0,
        };
        map.set(grupo, entry);
      } else {
        // completa metadados se necessário
        if (!entry.grupoNum) entry.grupoNum = grupoNum;
        if (!entry.slug && official?.slug) entry.slug = official.slug;
        if ((!entry.dezenas || !entry.dezenas.length) && official?.dezenas?.length) {
          entry.dezenas = official.dezenas;
        }
        if (!entry.animal && animalLabel) entry.animal = animalLabel;
      }

      // auditoria: se veio animal no dado e diverge do oficial, registra e “trava” no oficial
      if (
        animalFromData &&
        animalOfficial &&
        animalFromData !== animalOfficial &&
        integrityIssues.length < maxIntegrityIssues
      ) {
        integrityIssues.push({
          drawId: draw?.drawId ?? draw?.id ?? null,
          date: getDrawYmdRaw(draw),
          close_hour: getDrawHourRaw(draw) || null,
          grupo,
          grupoNum,
          animal_no_dado: animalRaw,
          animal_normalizado: animalFromData,
          animal_oficial: animalOfficial,
        });

        if (animalOfficial) entry.animal = animalOfficial;
      }

      entry.total += 1;
      totalOcorrencias += 1;
    }
  }

  // garante 01..25 sempre presentes
  for (let i = 1; i <= 25; i += 1) {
    const official = getOfficialByGrupo(i);
    const g = official?.grupo || pad2(i);

    let entry = map.get(g);

    if (!entry) {
      map.set(g, {
        grupo: g,
        grupoNum: i,
        animal: official?.animal || "",
        slug: official?.slug || "",
        dezenas: official?.dezenas || [],
        total: 0,
      });
    } else {
      if (!entry.grupoNum) entry.grupoNum = i;
      if (!entry.animal) entry.animal = official?.animal || "";
      if (!entry.slug) entry.slug = official?.slug || "";
      if ((!entry.dezenas || !entry.dezenas.length) && official?.dezenas?.length) {
        entry.dezenas = official.dezenas;
      }
    }
  }

  const ranking = Array.from(map.values()).sort((a, b) => {
    const dt = Number(b.total) - Number(a.total);
    if (dt !== 0) return dt;
    return String(a.grupo).localeCompare(String(b.grupo));
  });

  return {
    ranking,
    top3: ranking.slice(0, 3),
    totalOcorrencias,
    integrityIssues,
    totalDraws,
    uniqueDays,
    minDate,
    maxDate,

    // útil para a próxima etapa (definição de regra)
    countMode,
  };
}
