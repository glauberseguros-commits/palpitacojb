// src/pages/Dashboard/components/SearchResultsTable.jsx
import React, { useMemo, useState, useCallback } from "react";
import {
  getImgFromGrupo as getImgFromGrupoFn,
  getAnimalLabel as getAnimalLabelFn,
} from "../../../constants/bichoMap";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymdToBR(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

/* =========================
   Hora: padronizar para bucket "09h", "11h"...
========================= */
function hourBucketFromAny(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  // "11h", "11hs", "11hr"...
  const mh = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mh) return `${pad2(mh[1])}h`;

  // "11:10" ou "11:00" ou "11:10:00"
  const mISO = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (mISO) return `${pad2(mISO[1])}h`;

  // "11"
  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}h`;

  return s0; // fallback (não deveria)
}

/**
 * ✅ Base URL para assets do public/
 * - CRA: process.env.PUBLIC_URL
 * - fallback: "" (raiz)
 */
function publicBase() {
  const b = String(process.env.PUBLIC_URL || "").trim();
  return b && b !== "/" ? b : "";
}

/**
 * ✅ Normaliza caminhos de imagem para o React (public/)
 */
function normalizeImgSrc(src) {
  const s = safeStr(src);
  if (!s) return "";

  if (/^https?:\/\//i.test(s)) return s;

  const base = publicBase();

  if (s.startsWith("/")) return `${base}${s}`;

  if (s.startsWith("public/")) return `${base}/${s.slice("public/".length)}`;
  if (s.startsWith("img/")) return `${base}/${s}`;

  return `${base}/${s}`;
}

function swapSizeInPath(path, fromSize, toSize) {
  // troca "_96." por "_128." etc
  return path.replace(new RegExp(`_${fromSize}(?=\\.)`, "g"), `_${toSize}`);
}

function ensureSizeVariants(baseNoQuery) {
  const out = [];

  // se já tem _64/_96/_128 no nome, tenta os outros
  const has64 = /_64\./.test(baseNoQuery);
  const has96 = /_96\./.test(baseNoQuery);
  const has128 = /_128\./.test(baseNoQuery);

  if (has96) {
    out.push(swapSizeInPath(baseNoQuery, 96, 128));
    out.push(swapSizeInPath(baseNoQuery, 96, 64));
  }
  if (has128) {
    out.push(swapSizeInPath(baseNoQuery, 128, 96));
    out.push(swapSizeInPath(baseNoQuery, 128, 64));
  }
  if (has64) {
    out.push(swapSizeInPath(baseNoQuery, 64, 96));
    out.push(swapSizeInPath(baseNoQuery, 64, 128));
  }

  // se NÃO tiver size no nome, tenta inserir antes da extensão
  if (!has64 && !has96 && !has128) {
    const m = baseNoQuery.match(/^(.*)\.(png|PNG|jpg|jpeg)$/);
    if (m) {
      const stem = m[1];
      const ext = m[2];
      out.push(`${stem}_96.${ext}`);
      out.push(`${stem}_128.${ext}`);
      out.push(`${stem}_64.${ext}`);
    }
  }

  return out;
}

function makeImgVariants(src) {
  const current = normalizeImgSrc(src);
  if (!current) return [];

  const baseNoQuery = current.split("?")[0];
  const out = [];

  // principal
  out.push(baseNoQuery);

  // variações de size (muito comum o erro ser pedir _96 e existir _128)
  out.push(...ensureSizeVariants(baseNoQuery));

  // alterna case/extensão
  if (baseNoQuery.match(/\.png$/)) out.push(baseNoQuery.replace(/\.png$/, ".PNG"));
  if (baseNoQuery.match(/\.PNG$/)) out.push(baseNoQuery.replace(/\.PNG$/, ".png"));

  // tenta jpg/jpeg
  out.push(baseNoQuery.replace(/\.(png|PNG)$/i, ".jpg"));
  out.push(baseNoQuery.replace(/\.(png|PNG|jpg)$/i, ".jpeg"));

  // também troca extensão nas variantes de size (caso stem exista só em jpg etc)
  const extra = [];
  for (const p of out) {
    extra.push(p.replace(/\.(png|PNG)$/i, ".jpg"));
    extra.push(p.replace(/\.(png|PNG|jpg)$/i, ".jpeg"));
    if (p.match(/\.png$/)) extra.push(p.replace(/\.png$/, ".PNG"));
    if (p.match(/\.PNG$/)) extra.push(p.replace(/\.PNG$/, ".png"));
  }

  return Array.from(new Set([...out, ...extra].filter(Boolean)));
}

function RowImg({ variants, alt, fallbackText }) {
  const [failed, setFailed] = useState(false);

  if (!variants.length || failed) {
    return <div className="imgFallback">{fallbackText || "—"}</div>;
  }

  return (
    <img
      src={variants[0]}
      alt={alt}
      loading="lazy"
      data-try="0"
      onError={(e) => {
        const imgEl = e.currentTarget;
        const i = Number(imgEl.dataset.try || "0");
        const next = variants[i + 1];

        if (next) {
          imgEl.dataset.try = String(i + 1);
          imgEl.src = next;
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

/* =========================
   Normalização de row (compat)
========================= */

function pickGrupo(r) {
  const g =
    r?.grupo ??
    r?.grupo2 ??
    r?.group ??
    r?.group2 ??
    r?.animal_grupo ??
    r?.animalGrupo ??
    null;

  const n = Number(String(g ?? "").replace(/^0+/, "") || "");
  return Number.isFinite(n) ? n : null;
}

function pickPos(r) {
  const p = r?.position ?? r?.pos ?? r?.posicao ?? r?.colocacao ?? null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

function pickHour(r) {
  return (
    safeStr(r?.close_hour) ||
    safeStr(r?.closeHour) ||
    safeStr(r?.hour) ||
    safeStr(r?.hora) ||
    ""
  );
}

function pickYmd(r) {
  const y =
    safeStr(r?.ymd) ||
    safeStr(r?.dateYmd) ||
    safeStr(r?.date) ||
    safeStr(r?.data) ||
    "";
  return isYMD(y) ? y : safeStr(r?.ymd) || "";
}

function pickMilhar4(r) {
  const v =
    r?.milhar4 ??
    r?.milhar ??
    r?.numero ??
    r?.number ??
    r?.num ??
    r?.valor ??
    r?.n ??
    "";
  const digits = safeStr(v).replace(/\D+/g, "");
  if (!digits) return "";
  const last4 = digits.slice(-4).padStart(4, "0");
  return /^\d{4}$/.test(last4) ? last4 : "";
}

function resolveAnimalLabelCompat(fn, grupo) {
  if (typeof fn !== "function") return "";
  const g = Number(grupo);
  if (!Number.isFinite(g)) return "";

  try {
    const a = fn({ grupo: g, animal: "" });
    const s = safeStr(a);
    if (s) return s;
  } catch {}

  try {
    const b = fn(g);
    const s = safeStr(b);
    if (s) return s;
  } catch {}

  return "";
}

function resolveImgCompat(fn, grupo) {
  if (typeof fn !== "function") return "";
  const g = Number(grupo);
  if (!Number.isFinite(g)) return "";

  try {
    const a = fn(g, 96);
    const s = safeStr(a);
    if (s) return s;
  } catch {}

  try {
    const b = fn(g);
    const s = safeStr(b);
    if (s) return s;
  } catch {}

  return "";
}

export default function SearchResultsTable({
  rows,
  data,
  matches,
  getAnimalLabel,
  getImgFromGrupo,
}) {
  const safeRows = useMemo(() => {
    const src = Array.isArray(rows)
      ? rows
      : Array.isArray(data)
      ? data
      : Array.isArray(matches)
      ? matches
      : [];
    return src;
  }, [rows, data, matches]);

  const resolveAnimalLabel = useCallback(
    (grupo) => {
      const fn = typeof getAnimalLabel === "function" ? getAnimalLabel : getAnimalLabelFn;
      return resolveAnimalLabelCompat(fn, grupo);
    },
    [getAnimalLabel]
  );

  const resolveImg = useCallback(
    (grupo) => {
      const fn = typeof getImgFromGrupo === "function" ? getImgFromGrupo : getImgFromGrupoFn;
      return resolveImgCompat(fn, grupo);
    },
    [getImgFromGrupo]
  );

  const normalized = useMemo(() => {
    return safeRows.map((r, idx) => {
      const grupo = pickGrupo(r);
      const position = pickPos(r);
      const ymd = pickYmd(r);
      const close_hour_raw = pickHour(r);
      const close_hour = hourBucketFromAny(close_hour_raw); // ✅ PADRÃO "09h"

      const milhar4 = safeStr(r?.milhar4) || pickMilhar4(r);

      return {
        __idx: idx,
        __raw: r,
        ymd,
        close_hour,
        position,
        grupo,
        milhar4,
      };
    });
  }, [safeRows]);

  return (
    <div className="ppSearchTableWrap">
      <style>{`
        .ppSearchTableWrap{
          border-radius:18px;
          border:1px solid rgba(202,166,75,0.16);
          background:rgba(0,0,0,0.35);
          box-shadow:0 20px 60px rgba(0,0,0,0.35);
          overflow:hidden;
          flex:1 1 auto;
          min-height:0;
          min-width:0;
          display:flex;
          flex-direction:column;
        }

        .ppSearchTableHead{
          padding:10px 12px;
          border-bottom:1px solid rgba(255,255,255,0.06);
          font-size:10px;
          color:rgba(233,233,233,0.68);
          text-transform:uppercase;
          letter-spacing:0.6px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          flex:0 0 auto;
          min-width:0;
        }

        .ppSearchTableBody{
          overflow:auto;
          min-height:0;
          padding:10px 10px 12px;
          flex:1 1 auto;
          min-width:0;
        }

        .ppTable{
          width:100%;
          display:flex;
          justify-content:center;
          min-width:0;
        }

        /* ✅ CRÍTICO: aqui está o fix do "corte"
           - container permite scroll horizontal quando a largura não couber
           - tabela tem min-width (não encolhe até cortar colunas)
        */
        .ppTableInner{
          width: 100%;
          max-width: 980px;      /* ✅ cresce quando tem espaço */
          min-width: 0;
          border-radius:14px;
          overflow:auto;          /* ✅ scroll horizontal/vertical interno do "inner" */
          border:1px solid rgba(255,255,255,0.06);
          background:rgba(0,0,0,0.18);
        }

        table{
          width:100%;
          min-width:820px;       /* ✅ mantém layout original como mínimo */
          border-collapse:collapse;
          table-layout:fixed;
        }

        thead th{
          position:sticky; top:0; z-index:2;
          background:rgba(0,0,0,0.76);
          backdrop-filter:blur(8px);
          border-bottom:1px solid rgba(255,255,255,0.08);
          padding:8px 8px;
          font-size:10px;
          color:rgba(233,233,233,0.72);
          text-transform:uppercase;
          letter-spacing:0.6px;
          white-space:nowrap;
          text-align:center;
        }

        tbody td{
          padding:7px 8px;
          border-bottom:1px solid rgba(255,255,255,0.06);
          font-size:12px;
          color:rgba(233,233,233,0.92);
          white-space:nowrap;
          overflow:hidden;
          text-overflow:ellipsis;
          text-align:center;
        }

        tbody tr:hover td{ background:rgba(202,166,75,0.06); }

        .num{
          font-weight:900;
          letter-spacing:0.6px;
          font-variant-numeric: tabular-nums;
        }
        .gold{ color:#caa64b; font-weight:900; }

        .imgCell{
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .imgFrame{
          width:38px;
          height:38px;
          border-radius:10px;
          border:1px solid rgba(202,166,75,0.48);
          background:rgba(0,0,0,0.55);
          box-shadow:0 10px 26px rgba(0,0,0,0.35);
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          flex: 0 0 auto;
        }
        .imgFrame img{
          width:100%;
          height:100%;
          object-fit:cover;
          display:block;
        }
        .imgFallback{
          font-size:10px;
          color:rgba(233,233,233,0.75);
          font-weight:900;
          letter-spacing:0.4px;
        }

        /* ✅ BICHO perto da imagem e com leitura melhor */
        td.bicho{
          text-align:left;
          padding-left:10px;
          font-weight:900;
          letter-spacing:0.3px;
        }
      `}</style>

      <div className="ppSearchTableHead">
        <div>Resultados (aparições)</div>
        <div>
          Total: <span className="gold">{normalized.length}</span>
        </div>
      </div>

      <div className="ppSearchTableBody">
        <div className="ppTable">
          <div className="ppTableInner">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Data</th>
                  <th style={{ width: 90 }}>Horário</th>
                  <th style={{ width: 90 }}>Posição</th>
                  <th style={{ width: 120 }}>Número</th>
                  <th style={{ width: 140 }}>Grupo</th>
                  <th style={{ width: 90 }}>Imagem</th>
                  <th style={{ width: 180 }}>Bicho</th>
                </tr>
              </thead>

              <tbody>
                {normalized.map((r) => {
                  const g = r.grupo;
                  const hasGrupo = Number.isFinite(g) && g >= 1 && g <= 25;

                  const animal = hasGrupo ? resolveAnimalLabel(g) : "";
                  const img0raw = hasGrupo ? resolveImg(g) : "";
                  const variants = hasGrupo ? makeImgVariants(img0raw) : [];

                  const key = `${r.ymd || "x"}-${r.close_hour || "h"}-${r.position ?? "p"}-${r.milhar4 || "n"}-${r.__idx}`;

                  return (
                    <tr key={key}>
                      <td>{r.ymd ? ymdToBR(r.ymd) : "—"}</td>
                      <td>{r.close_hour || "—"}</td>
                      <td>{r.position ? `${r.position}º` : "—"}</td>
                      <td className="num">{r.milhar4 || "—"}</td>
                      <td className="gold">{hasGrupo ? `GRUPO ${pad2(g)}` : "—"}</td>

                      <td className="imgCell">
                        <div
                          className="imgFrame"
                          title={
                            variants[0]
                              ? `src: ${variants[0]}`
                              : hasGrupo
                              ? `Grupo ${pad2(g)}`
                              : ""
                          }
                        >
                          <RowImg
                            variants={variants}
                            alt={animal || (hasGrupo ? `Grupo ${pad2(g)}` : "—")}
                            fallbackText={hasGrupo ? `G${pad2(g)}` : "—"}
                          />
                        </div>
                      </td>

                      <td className="bicho" title={animal || ""}>
                        {animal || "—"}
                      </td>
                    </tr>
                  );
                })}

                {!normalized.length ? (
                  <tr>
                    <td
                      colSpan={7}
                      style={{
                        padding: 14,
                        textAlign: "center",
                        color: "rgba(233,233,233,0.70)",
                      }}
                    >
                      Nenhum resultado (digite 2, 3 ou 4 dígitos).
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
