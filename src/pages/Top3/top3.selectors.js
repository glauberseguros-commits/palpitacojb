import { pad2, safeStr } from "./top3.formatters";

function publicBase() {
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b : "";
}

export function normalizeImgSrc(src) {
  const s = safeStr(src);
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;

  const base = publicBase();
  if (s.startsWith("/")) return `${base}${s}`;
  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  if (s.startsWith("img/")) return `${base}/${s}`;
  return `${base}/${s}`;
}

/**
 * tenta múltiplas variações de imagem por grupo/tamanho
 */
export function makeImgVariantsFromGrupo({ grupo, size, getImgFromGrupo, getAnimalLabel }) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g <= 0) return [];

  const s = Number(size) || 96;

  const primary = normalizeImgSrc(
    getImgFromGrupo?.(g, s) || getImgFromGrupo?.(g) || ""
  );

  const base = publicBase();
  const g2 = pad2(g);

  const label = safeStr(getAnimalLabel?.(g) || "");
  const slug = label
    ? label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
    : "";

  const sizedName = slug
    ? `${base}/assets/animals/animais_${s}_png/${g2}_${slug}_${s}.png`
    : "";

  const seeds = [primary, sizedName].filter(Boolean);

  const out = [];
  for (const seed of seeds) {
    const clean = String(seed).split("?")[0];
    if (!clean) continue;

    out.push(clean);
    if (clean.match(/\.png$/)) out.push(clean.replace(/\.png$/, ".PNG"));
    if (clean.match(/\.PNG$/)) out.push(clean.replace(/\.PNG$/, ".png"));

    out.push(clean.replace(/\.(png|PNG)$/i, ".jpg"));
    out.push(clean.replace(/\.(png|PNG|jpg)$/i, ".jpeg"));
    out.push(`${clean}?v=1`);
  }

  return Array.from(new Set(out.filter(Boolean)));
}

export function lotteryLabel(lotteryKey) {
  const k = safeStr(lotteryKey).toUpperCase();
  if (k === "FEDERAL") return "FEDERAL (20h • qua/sáb)";
  if (k === "PT_RIO") return "RIO (PT_RIO)";
  return k || "—";
}
