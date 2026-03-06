import { pad2, safeStr } from "./top3.formatters";

function publicBase() {
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b.replace(/\/+$/, "") : "";
}

function joinPublic(base, path) {
  if (!path) return "";

  const p = path.startsWith("/") ? path : `/${path}`;

  if (!base) return p;

  return `${base}${p}`;
}

export function normalizeImgSrc(src) {

  const s0 = safeStr(src);
  if (!s0) return "";

  if (/^(https?:)?\/\//i.test(s0)) return s0;
  if (/^(data:|blob:)/i.test(s0)) return s0;

  const base = publicBase();

  let s = s0;

  s = s.replace(/^(\.\/)+/, "");
  s = s.replace(/^(\.\.\/)+/, "");

  if (base) {
    if (s === base) return s;
    if (s.startsWith(base + "/")) return s;
  }

  if (s.startsWith("/")) return joinPublic(base, s);
  if (s.startsWith("public/")) return joinPublic(base, s.slice("public/".length));

  return joinPublic(base, s);
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

  const q = s.indexOf("?");

  return q >= 0 ? s.slice(0, q) : s;
}

function addCacheBust(url, token = "v=1") {

  const s = safeStr(url);
  if (!s) return "";

  return s.includes("?") ? `${s}&${token}` : `${s}?${token}`;
}

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

  const bySlugPng = slug ? joinPublic(base, `img/${slug}_${s}.png`) : "";
  const bySlugJpg = slug ? joinPublic(base, `img/${slug}_${s}.jpg`) : "";
  const bySlugJpeg = slug ? joinPublic(base, `img/${slug}_${s}.jpeg`) : "";

  const byGroupPng = joinPublic(base, `img/g${g2}_${s}.png`);
  const byGroupJpg = joinPublic(base, `img/g${g2}_${s}.jpg`);
  const byGroupJpeg = joinPublic(base, `img/g${g2}_${s}.jpeg`);

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

    push(original);

    const clean = stripQuery(original);

    if (!clean) continue;

    push(clean);

    if (clean.endsWith(".png")) push(clean.slice(0, -4) + ".PNG");
    if (clean.endsWith(".PNG")) push(clean.slice(0, -4) + ".png");

    if (/\.(png|PNG|jpg|jpeg)$/i.test(clean)) {

      push(clean.replace(/\.(png|PNG)$/i, ".jpg"));
      push(clean.replace(/\.(png|PNG|jpg|jpeg)$/i, ".jpeg"));
    }

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