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
  const h = s.indexOf("#");

  const cut =
    q >= 0 && h >= 0
      ? Math.min(q, h)
      : q >= 0
        ? q
        : h >= 0
          ? h
          : -1;

  return cut >= 0 ? s.slice(0, cut) : s;
}

function addCacheBust(url, token = "v=1") {
  const s = safeStr(url);
  if (!s) return "";

  return s.includes("?") ? `${s}&${token}` : `${s}?${token}`;
}

function pushExtensionVariants(out, clean) {
  const s = safeStr(clean);
  if (!s) return;

  out.push(s);

  const m = s.match(/\.(png|jpg|jpeg|webp)$/i);
  if (!m) return;

  const base = s.slice(0, -m[0].length);

  out.push(`${base}.png`);
  out.push(`${base}.jpg`);
  out.push(`${base}.jpeg`);
  out.push(`${base}.webp`);
}

export function makeImgVariantsFromGrupo({
  grupo,
  size,
  getImgFromGrupo,
  getAnimalLabel,
}) {
  const g = Number(grupo);

  if (!Number.isFinite(g) || g < 1 || g > 25) return [];

  const s = Math.max(1, Number(size) || 96);

  const base = publicBase();
  const g2 = pad2(g);

  const label = safeStr(getAnimalLabel?.(g) || "");
  const slug = slugifyLabel(label);

  const primary = normalizeImgSrc(
    getImgFromGrupo?.(g, s) || getImgFromGrupo?.(g) || ""
  );

  const seeds = [
    primary,

    slug ? joinPublic(base, `img/${slug}_${s}.png`) : "",
    slug ? joinPublic(base, `img/${slug}_${s}.jpg`) : "",
    slug ? joinPublic(base, `img/${slug}_${s}.jpeg`) : "",
    slug ? joinPublic(base, `img/${slug}_${s}.webp`) : "",

    joinPublic(base, `img/g${g2}_${s}.png`),
    joinPublic(base, `img/g${g2}_${s}.jpg`),
    joinPublic(base, `img/g${g2}_${s}.jpeg`),
    joinPublic(base, `img/g${g2}_${s}.webp`),
  ].filter(Boolean);

  const out = [];

  for (const seed of seeds) {
    const original = safeStr(seed);
    if (!original) continue;

    out.push(original);

    const clean = stripQuery(original);
    if (!clean) continue;

    pushExtensionVariants(out, clean);

    out.push(addCacheBust(clean, "v=1"));
  }

  return Array.from(new Set(out.filter(Boolean)));
}

export function lotteryLabel(lotteryKey) {
  const k = safeStr(lotteryKey).toUpperCase();

  if (k === "FEDERAL") return "FEDERAL (20h • qua/sáb)";
  if (k === "PT_RIO") return "RIO (PT_RIO)";

  return k || "—";
}