// src/pages/Top3/top3.selectors.js
import { pad2, safeStr } from "./top3.formatters";

function publicBase() {
  // CRA (react-scripts): usa apenas PUBLIC_URL
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b.replace(/\/+$/, "") : "";
}

export function normalizeImgSrc(src) {
  const s0 = safeStr(src);
  if (!s0) return "";

  // ✅ não mexe em URLs absolutas / especiais
  // - http(s)://
  // - //cdn...
  // - data:... (placeholder)
  // - blob:... (URL em runtime)
  if (/^(https?:)?\/\//i.test(s0)) return s0;
  if (/^(data:|blob:)/i.test(s0)) return s0;

  const base = publicBase();
  let s = s0;

  // normaliza "./" e "../" (casos comuns)
  s = s.replace(/^(\.\/)+/, "");
  s = s.replace(/^(\.\.\/)+/, "");

  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;

  return `${base}/${s}`;
}

function slugifyLabel(label) {
  const l = safeStr(label);
  if (!l) return "";
  return l
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function stripQuery(url) {
  const s = safeStr(url);
  if (!s) return "";
  // remove só querystring (mantém path)
  const q = s.indexOf("?");
  return q >= 0 ? s.slice(0, q) : s;
}

function addCacheBust(url, token = "v=1") {
  const s = safeStr(url);
  if (!s) return "";
  return s.includes("?") ? `${s}&${token}` : `${s}?${token}`;
}

/**
 * tenta múltiplas variações de imagem por grupo/tamanho
 * ✅ prioridade: getImgFromGrupo (map oficial)
 * ✅ fallback: public/img/<slug>_<size>.(png/jpg/jpeg)
 */
export function makeImgVariantsFromGrupo({
  grupo,
  size,
  getImgFromGrupo,
  getAnimalLabel,
}) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return [];

  const s = Number(size) || 96;
  const base = publicBase();
  const g2 = pad2(g);

  const label = safeStr(getAnimalLabel?.(g) || "");
  const slug = slugifyLabel(label);

  const primary = normalizeImgSrc(
    getImgFromGrupo?.(g, s) || getImgFromGrupo?.(g) || ""
  );

  // padrão real em public/img: ex: avestruz_96.png
  const bySlugPng = slug ? `${base}/img/${slug}_${s}.png` : "";
  const bySlugJpg = slug ? `${base}/img/${slug}_${s}.jpg` : "";
  const bySlugJpeg = slug ? `${base}/img/${slug}_${s}.jpeg` : "";

  // fallback extra (se existir por grupo)
  const byGroupPng = `${base}/img/g${g2}_${s}.png`;
  const byGroupJpg = `${base}/img/g${g2}_${s}.jpg`;
  const byGroupJpeg = `${base}/img/g${g2}_${s}.jpeg`;

  const seeds = [
    primary,
    bySlugPng,
    bySlugJpg,
    bySlugJpeg,
    byGroupPng,
    byGroupJpg,
    byGroupJpeg,
  ].filter(Boolean);

  const out = [];
  const push = (v) => {
    const x = safeStr(v);
    if (x) out.push(x);
  };

  for (const seed of seeds) {
    const original = safeStr(seed);
    if (!original) continue;

    // ✅ 1) mantém o seed original (inclui query real, se tiver)
    push(original);

    // ✅ 2) gera também a versão "clean" (sem query) para variações
    const clean = stripQuery(original);
    if (!clean) continue;

    // mantém também o clean (sem query)
    push(clean);

    // variações de case
    if (clean.endsWith(".png")) push(clean.slice(0, -4) + ".PNG");
    if (clean.endsWith(".PNG")) push(clean.slice(0, -4) + ".png");

    // variações de extensão (a partir do clean)
    if (/\.(png|PNG|jpg|jpeg)$/i.test(clean)) {
      push(clean.replace(/\.(png|PNG)$/i, ".jpg"));
      push(clean.replace(/\.(png|PNG|jpg|jpeg)$/i, ".jpeg"));
    }

    // ✅ cache-bust: aplica no clean e também no original (sem perder query real)
    push(addCacheBust(clean, "v=1"));
    push(addCacheBust(original, "v=1"));
  }

  return Array.from(new Set(out.filter(Boolean)));
}

export function lotteryLabel(lotteryKey) {
  const k = safeStr(lotteryKey).toUpperCase();
  if (k === "FEDERAL") return "FEDERAL (20h • qua/sáb)";
  if (k === "PT_RIO") return "RIO (PT_RIO)";
  return k || "—";
}