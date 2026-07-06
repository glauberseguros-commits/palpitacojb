import { getImgFromGrupo } from "../../constants/bichoMap";

export function normalizeImgSrc(src) {
  const s = String(src || "").trim();
  if (!s) return "";

  if (/^https?:\/\//i.test(s)) return s;

  const base = String(process.env.PUBLIC_URL || "").trim();
  const root = base && base !== "/" ? base : "";

  if (s.startsWith("/")) return `${root}${s}`;
  if (s.startsWith("public/")) return `${root}/${s.slice(7)}`;
  if (s.startsWith("img/")) return `${root}/${s}`;

  return `${root}/${s}`;
}

export function getGrupoImgSrc(grupo, size = 512) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return "";

  return normalizeImgSrc(
    getImgFromGrupo?.(g, size) || getImgFromGrupo?.(g) || ""
  );
}

export function buildResultStyleImgVariants(grupo, size = 96) {
  const g = Number(grupo);
  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const seeds = [getImgFromGrupo?.(g, size), getImgFromGrupo?.(g)]
    .map(normalizeImgSrc)
    .filter(Boolean);

  const out = [];

  for (const seed of seeds) {
    const clean = String(seed).split("?")[0];
    if (!clean) continue;

    out.push(clean);

    if (/\.png$/i.test(clean)) {
      out.push(clean.replace(/\.png$/i, ".jpg"));
      out.push(clean.replace(/\.png$/i, ".jpeg"));
      out.push(clean.replace(/\.png$/i, ".webp"));
    } else if (/\.jpg$/i.test(clean)) {
      out.push(clean.replace(/\.jpg$/i, ".png"));
      out.push(clean.replace(/\.jpg$/i, ".jpeg"));
      out.push(clean.replace(/\.jpg$/i, ".webp"));
    } else if (/\.jpeg$/i.test(clean)) {
      out.push(clean.replace(/\.jpeg$/i, ".png"));
      out.push(clean.replace(/\.jpeg$/i, ".jpg"));
      out.push(clean.replace(/\.jpeg$/i, ".webp"));
    } else if (/\.webp$/i.test(clean)) {
      out.push(clean.replace(/\.webp$/i, ".png"));
      out.push(clean.replace(/\.webp$/i, ".jpg"));
      out.push(clean.replace(/\.webp$/i, ".jpeg"));
    }
  }

  return Array.from(new Set(out.filter(Boolean)));
}