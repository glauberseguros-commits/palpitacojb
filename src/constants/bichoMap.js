// src/constants/bichoMap.js

/**
 * bichoMap (PalPitaco)
 * - Mapa oficial dos 25 bichos (grupo, nome, slug, dezenas)
 * - Helpers para label, dezenas, imagem e palpite (placeholder)
 *
 * ✅ IMPORTANTE (SEU PADRÃO CONFIRMADO):
 * Suas imagens estão em:
 * public/assets/animals/animais_<size>_png/
 * e o arquivo segue o padrão:
 * "<grupo2>_<slug>.png"
 *
 * Exemplo real:
 * public/assets/animals/animais_256_png/01_avestruz.png
 */

/* =========================
   Utils
========================= */

/**
 * Normaliza nomes de animal:
 * - UPPER
 * - remove acentos
 * - colapsa espaços
 */
export function normalizeAnimal(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(s) {
  return String(s || "").replace(/[^\d]/g, "");
}

function pad2(n) {
  return String(Number(n) || 0).padStart(2, "0");
}

function stripSlashes(s) {
  return String(s || "").replace(/\/+$/, "");
}

/**
 * ✅ Base pública do app:
 * - Vite: import.meta.env.BASE_URL (normalmente "/")
 * - CRA: process.env.PUBLIC_URL
 * - fallback: ""
 *
 * Retorna "" (raiz) ou "/subpasta" (sem barra no final).
 */
function getPublicBase() {
  // Vite (preferência)
  try {
    const viteBase =
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      typeof import.meta.env.BASE_URL === "string"
        ? String(import.meta.env.BASE_URL).trim()
        : "";

    // BASE_URL do Vite normalmente vem como "/" ou "/sub/"
    if (viteBase && viteBase !== "/") return stripSlashes(viteBase);
  } catch {
    // noop
  }

  // CRA
  const craBase = (typeof process !== "undefined" && process.env && typeof process.env.PUBLIC_URL === "string") ? String(process.env.PUBLIC_URL).trim() : "";
  if (craBase && craBase !== "/") return stripSlashes(craBase);

  return "";
}

/**
 * ✅ Converte "qualquer coisa que represente grupo" em número 1..25
 * Aceita:
 * - 18
 * - "18"
 * - "018"
 * - "GRUPO 18"
 * - "Grupo 04"
 * - "G18"
 */
function coerceGrupoNumber(input) {
  if (input == null) return null;

  if (typeof input === "number") {
    const g = Math.trunc(input);
    if (!Number.isFinite(g)) return null;
    if (g < 1 || g > 25) return null;
    return g;
  }

  const dig = onlyDigits(input);
  if (!dig) return null;

  const g = Number(dig);
  if (!Number.isFinite(g)) return null;
  if (g < 1 || g > 25) return null;
  return g;
}

/* =========================
   Base (25 bichos)
========================= */

export const BICHO_MAP = [
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

/* =========================
   Índices rápidos
========================= */

const BY_GRUPO = new Map(BICHO_MAP.map((b) => [Number(b.grupo), b]));
const BY_ANIMAL_NORM = new Map(BICHO_MAP.map((b) => [normalizeAnimal(b.animal), b]));

/* =========================
   Lookups
========================= */

export function getBichoByGrupo(grupo) {
  const g = coerceGrupoNumber(grupo);
  if (!Number.isFinite(g)) return null;
  return BY_GRUPO.get(g) || null;
}

export function getBichoByAnimalName(animal) {
  const key = normalizeAnimal(animal);
  if (!key) return null;
  return BY_ANIMAL_NORM.get(key) || null;
}

/**
 * ✅ getAnimalLabel — COMPAT TOTAL
 * Aceita:
 * - getAnimalLabel(14)
 * - getAnimalLabel({ grupo: 14 })
 * - getAnimalLabel({ animal: "ÁGUIA" })
 * - getAnimalLabel("ÁGUIA")
 */
export function getAnimalLabel(input = null) {
  // número puro (ou string numérica pura)
  const s = String(input ?? "").trim();
  if (typeof input === "number" || (s && /^\d+$/.test(s))) {
    const byGrupo = getBichoByGrupo(input);
    return byGrupo?.animal ? byGrupo.animal : "";
  }

  if (typeof input === "string") {
    const byName = getBichoByAnimalName(input);
    if (byName?.animal) return byName.animal;

    const raw = String(input || "").trim();
    return raw ? raw.toUpperCase() : "";
  }

  if (input && typeof input === "object") {
    const grupo = input?.grupo ?? null;
    const animal = input?.animal ?? null;

    const byGrupo = grupo != null ? getBichoByGrupo(grupo) : null;
    if (byGrupo?.animal) return byGrupo.animal;

    const byName = animal ? getBichoByAnimalName(animal) : null;
    if (byName?.animal) return byName.animal;

    const raw = String(animal || "").trim();
    return raw ? raw.toUpperCase() : "";
  }

  return "";
}

/* =========================
   Palpite (placeholder evolutivo)
========================= */

export function guessPalpiteFromGrupo(grupo, ctx = null) {
  if (ctx && typeof ctx === "object" && ctx.palpite4 != null) {
    const digits = onlyDigits(ctx.palpite4).slice(-4);
    return digits ? digits.padStart(4, "0") : "----";
  }

  const b = getBichoByGrupo(grupo);
  if (!b) return "----";

  if (ctx && typeof ctx === "object") {
    const dez = onlyDigits(ctx.dezena).slice(-2);
    const uC = onlyDigits(ctx.unidadeCentena).slice(-1);
    const uM = onlyDigits(ctx.unidadeMilhar).slice(-1);

    if (dez) {
      const milhar = (uM || "0").slice(-1);
      const centena = (uC || "0").slice(-1);
      return `${milhar}${centena}${dez}`.padStart(4, "0");
    }
  }

  const dezFallback =
    Array.isArray(b.dezenas) && b.dezenas.length
      ? String(b.dezenas[b.dezenas.length - 1])
      : "00";

  const dez = onlyDigits(dezFallback).slice(-2) || "00";
  return `00${dez}`.padStart(4, "0");
}

/* =========================
   Imagens / helpers
========================= */

const PREFER_ASSETS_FOLDER = true;

function normalizeAllowedSize(size) {
  const allowed = [16, 24, 32, 64, 96, 128, 192, 256];

  let s = Number(size);
  if (!Number.isFinite(s) || s <= 0) s = 96;

  for (const a of allowed) {
    if (s <= a) return a;
  }
  return 256;
}

/**
 * ✅ Retorna a URL correta da imagem para o grupo e tamanho.
 *
 * SEU PADRÃO (confirmado):
 * /assets/animals/animais_<size>_png/<grupo2>_<slug>.png
 *
 * Compat extra (sem inflar projeto):
 * - expõe uma função de fallback com sufixo do tamanho no nome
 *
 * OBS: o React <img> não "tenta" fallback sozinho; ele precisa de onError.
 */
export function getImgFromGrupo(grupo, size = null) {
  const b = getBichoByGrupo(grupo);
  if (!b) return "";

  const base = getPublicBase();
  const g2 = pad2(b.grupo);
  const s = normalizeAllowedSize(size);

  // padrão antigo (se algum componente ainda usar /img)
  if (!PREFER_ASSETS_FOLDER) {
    return `${base}/img/${b.slug}_${s}.png`;
  }

  // ✅ padrão novo (SEU): sem sufixo do tamanho no nome
  return `${base}/assets/animals/animais_${s}_png/${g2}_${b.slug}.png`;
}

/**
 * ✅ Fallback opcional: com sufixo do tamanho no nome (caso exista em alguma pasta)
 * Uso (onde você tem onError):
 *   const primary = getImgFromGrupo(g, 64);
 *   const fallback = getImgFromGrupoFallback(g, 64);
 */
export function getImgFromGrupoFallback(grupo, size = null) {
  const b = getBichoByGrupo(grupo);
  if (!b) return "";

  const base = getPublicBase();
  const g2 = pad2(b.grupo);
  const s = normalizeAllowedSize(size);

  if (!PREFER_ASSETS_FOLDER) {
    return `${base}/img/${b.slug}_${s}.png`;
  }

  return `${base}/assets/animals/animais_${s}_png/${g2}_${b.slug}_${s}.png`;
}

/**
 * (Opcional) helper para pegar dezenas do grupo
 */
export function getDezenasByGrupo(grupo) {
  const b = getBichoByGrupo(grupo);
  return b?.dezenas ? [...b.dezenas] : [];
}

/**
 * (Opcional) helper para pegar slug do grupo
 */
export function getSlugByGrupo(grupo) {
  const b = getBichoByGrupo(grupo);
  return b?.slug || "";
}

