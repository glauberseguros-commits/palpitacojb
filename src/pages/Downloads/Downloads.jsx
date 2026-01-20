// src/pages/Downloads/Downloads.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { getKingResultsByRange, getKingBoundsByUf } from "../../services/kingResultsService";
import { getAnimalLabel } from "../../constants/bichoMap";

const GOLD = "rgba(202,166,75,1)";
const GOLD_SOFT = "rgba(202,166,75,0.16)";
const GOLD_SOFT2 = "rgba(202,166,75,0.24)";
const WHITE = "rgba(255,255,255,0.92)";
const WHITE_78 = "rgba(255,255,255,0.78)";
const WHITE_60 = "rgba(255,255,255,0.60)";
const BLACK_GLASS = "rgba(0,0,0,0.35)";

/* =========================
   Helpers (robustos)
========================= */

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function safeStr(v) {
  return String(v ?? "").trim();
}

function isYMD(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
}

function ymdToBR(ymd) {
  const m = String(ymd || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return safeStr(ymd);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function normalizeHourLike(value) {
  const s0 = safeStr(value);
  if (!s0) return "";

  const s = s0.replace(/\s+/g, "");

  const mhx = s.match(/^(\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const m2 = s.match(/^(\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0;
}

function toHourBucket(hhmm) {
  const s = normalizeHourLike(hhmm);
  const m = s.match(/^(\d{2}):(\d{2})$/);
  if (!m) return s;
  return `${m[1]}:00`;
}

function normalizeToYMD(input) {
  if (!input) return null;

  if (typeof input === "object" && typeof input.toDate === "function") {
    const d = input.toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
  }

  const s = safeStr(input);
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function todayYMDLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getDowKey(ymd) {
  if (!isYMD(ymd)) return null;
  const [Y, M, D] = ymd.split("-").map((x) => Number(x));
  const dt = new Date(Y, M - 1, D);
  return dt.getDay();
}

function getMonthNum(ymd) {
  if (!isYMD(ymd)) return null;
  const m = ymd.match(/^\d{4}-(\d{2})-\d{2}$/);
  if (!m) return null;
  return Number(m[1]);
}

function getDayNum(ymd) {
  if (!isYMD(ymd)) return null;
  const m = ymd.match(/^\d{4}-\d{2}-(\d{2})$/);
  if (!m) return null;
  return Number(m[1]);
}

function guessPrizePos(p) {
  const pos = Number.isFinite(Number(p?.position))
    ? Number(p.position)
    : Number.isFinite(Number(p?.posicao))
    ? Number(p.posicao)
    : Number.isFinite(Number(p?.pos))
    ? Number(p.pos)
    : Number.isFinite(Number(p?.colocacao))
    ? Number(p.colocacao)
    : null;
  return pos;
}

function guessPrizeGrupo(p) {
  const g = Number.isFinite(Number(p?.grupo2))
    ? Number(p.grupo2)
    : Number.isFinite(Number(p?.group2))
    ? Number(p.group2)
    : Number.isFinite(Number(p?.grupo))
    ? Number(p.grupo)
    : Number.isFinite(Number(p?.group))
    ? Number(p.group)
    : Number.isFinite(Number(p?.animal_grupo))
    ? Number(p.animal_grupo)
    : null;
  return g;
}

function pickPrizeMilhar4(p) {
  const raw =
    p?.milhar ??
    p?.milhar4 ??
    p?.numero ??
    p?.number ??
    p?.mil ??
    p?.num ??
    p?.valor ??
    "";
  const digits = safeStr(raw).replace(/\D+/g, "");
  if (!digits) return null;
  const last4 = digits.slice(-4).padStart(4, "0");
  return /^\d{4}$/.test(last4) ? last4 : null;
}

function getDezena2(milhar4) {
  const s = safeStr(milhar4);
  if (!/^\d{4}$/.test(s)) return "";
  return s.slice(2, 4);
}

function getCentena3(milhar4) {
  const s = safeStr(milhar4);
  if (!/^\d{4}$/.test(s)) return "";
  return s.slice(1, 4);
}

function pickDrawHour(draw) {
  return normalizeHourLike(draw?.close_hour || draw?.closeHour || draw?.hour || draw?.hora || "");
}

function pickDrawYMD(draw) {
  const y =
    draw?.ymd ||
    normalizeToYMD(draw?.date) ||
    normalizeToYMD(draw?.data) ||
    normalizeToYMD(draw?.dt) ||
    null;
  return y;
}

const UF_TO_LOTTERY_KEY = { RJ: "PT_RIO" };

function normalizeUfToQueryKey(input) {
  const s = safeStr(input).toUpperCase();
  if (!s) return "";
  if (s.includes("_") || s.length > 2) return s;
  return UF_TO_LOTTERY_KEY[s] || s;
}

function lotteryLabelFromKey(key) {
  const s = safeStr(key).toUpperCase();
  if (s === "PT_RIO") return "RIO";
  if (s.length === 2) return s;
  const parts = s.split("_");
  return parts[parts.length - 1] || s;
}

/* =========================
   Bounds helpers (FIX principal)
========================= */

function clampYmd(ymd, minDate, maxDate) {
  const d = normalizeToYMD(ymd);
  if (!isYMD(d)) return null;

  let out = d;

  if (isYMD(minDate) && out < minDate) out = minDate;
  if (isYMD(maxDate) && out > maxDate) out = maxDate;

  return out;
}

function normalizeRangeWithBounds(fromIn, toIn, minDate, maxDate) {
  let from = clampYmd(fromIn, minDate, maxDate);
  let to = clampYmd(toIn, minDate, maxDate);

  const fallback = clampYmd(todayYMDLocal(), minDate, maxDate) || maxDate || minDate || todayYMDLocal();

  if (!from) from = fallback;
  if (!to) to = from;

  if (from > to) [from, to] = [to, from];

  return { from, to };
}

/* =========================
   Export helpers
========================= */

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportExcelXlsx({
  filename,
  title,
  metaLines,
  columns,
  rows,
  textCols,
  sheetName = "resultados",
}) {
  const mod = await import("xlsx");
  const XLSX = mod?.default ?? mod;

  const aoa = [];
  aoa.push([String(title || "Exportação")]);
  (metaLines || []).forEach((l) => aoa.push([String(l || "")]));
  aoa.push([]);
  aoa.push(columns.map((c) => String(c ?? "")));
  rows.forEach((r) => aoa.push((r || []).map((v) => String(v ?? ""))));

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const headerRowNumber = 1 + (metaLines?.length || 0) + 1 + 1;
  ws["!freeze"] = { xSplit: 0, ySplit: headerRowNumber };

  const firstDataRowAoa = (metaLines?.length || 0) + 3;
  const tcols = Array.isArray(textCols) ? textCols : [];

  if (tcols.length) {
    for (let r = 0; r < rows.length; r += 1) {
      const aoaRowIndex = firstDataRowAoa + r;
      for (const c of tcols) {
        const cellAddr = XLSX.utils.encode_cell({ r: aoaRowIndex, c });
        const cell = ws[cellAddr];
        if (!cell) continue;
        cell.t = "s";
        cell.z = "@";
        cell.v = String(cell.v ?? "");
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const array = XLSX.write(wb, { bookType: "xlsx", type: "array" });

  const blob = new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  downloadBlob(filename, blob);
}

function exportExcelXls({ filename, title, metaLines, columns, rows, textCols }) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const isTextCol = (idx) => Array.isArray(textCols) && textCols.includes(idx);

  const thead = `<tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const tbody = rows
    .map((r) => {
      const tds = r
        .map((v, idx) => {
          const style = isTextCol(idx) ? ` style="mso-number-format:'\\@';"` : "";
          return `<td${style}>${esc(v)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const metaHtml = (metaLines || [])
    .map((l) => `<div style="margin:2px 0;">${esc(l)}</div>`)
    .join("");

  const html = `
  <html xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8" />
      <!--[if gte mso 9]><xml>
        <x:ExcelWorkbook>
          <x:ExcelWorksheets>
            <x:ExcelWorksheet>
              <x:Name>resultados</x:Name>
              <x:WorksheetOptions>
                <x:Print><x:ValidPrinterInfo/></x:Print>
              </x:WorksheetOptions>
            </x:ExcelWorksheet>
          </x:ExcelWorksheets>
        </x:ExcelWorkbook>
      </xml><![endif]-->
    </head>
    <body>
      <div style="font-family: Arial; font-size: 14px; font-weight: 700; margin-bottom: 6px;">
        ${esc(title || "Exportação")}
      </div>
      <div style="font-family: Arial; font-size: 12px; margin-bottom: 10px;">
        ${metaHtml}
      </div>
      <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; font-family: Arial; font-size: 12px;">
        <thead style="font-weight:700;background:#f2f2f2;">${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </body>
  </html>`.trim();

  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  downloadBlob(filename, blob);
}

async function exportPdfReal({
  filename,
  title,
  metaLines,
  columns,
  rows,
  orientation = "landscape",
}) {
  const jsPDFMod = await import("jspdf");
  const jsPDF = jsPDFMod?.jsPDF ?? jsPDFMod?.default ?? jsPDFMod;

  const autoTableMod = await import("jspdf-autotable");
  const autoTable = autoTableMod?.default ?? autoTableMod?.autoTable ?? autoTableMod;

  const doc = new jsPDF({ orientation, unit: "pt", format: "a4", compress: true });

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 34;
  const marginTop = 34;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(String(title || "Relatório"), marginX, marginTop);

  const metas = Array.isArray(metaLines) ? metaLines : [];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  let y = marginTop + 16;
  for (const line of metas) {
    const s = String(line ?? "");
    if (!s) continue;
    const wrapped = doc.splitTextToSize(s, pageWidth - marginX * 2);
    doc.text(wrapped, marginX, y);
    y += wrapped.length * 12;
  }

  y += 10;

  const head = [columns.map((c) => String(c ?? ""))];
  const body = (rows || []).map((r) => (r || []).map((v) => String(v ?? "")));

  if (typeof doc.autoTable !== "function") {
    if (typeof autoTable === "function") {
      autoTable(doc, {
        startY: y,
        head,
        body,
        theme: "grid",
        styles: { font: "helvetica", fontSize: 9, cellPadding: 4, overflow: "linebreak", valign: "middle" },
        headStyles: { fontStyle: "bold" },
        margin: { left: marginX, right: marginX },
        tableWidth: pageWidth - marginX * 2,
      });
    } else {
      throw new Error("Falha ao carregar 'jspdf-autotable'. Confirme: npm i jspdf-autotable");
    }
  } else {
    doc.autoTable({
      startY: y,
      head,
      body,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, overflow: "linebreak", valign: "middle" },
      headStyles: { fontStyle: "bold" },
      margin: { left: marginX, right: marginX },
      tableWidth: pageWidth - marginX * 2,
    });
  }

  const pageCount = doc.getNumberOfPages();
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const footer = `Página ${i} / ${pageCount}`;
    const w = doc.getTextWidth(footer);
    doc.text(footer, pageWidth - marginX - w, doc.internal.pageSize.getHeight() - 18);
  }

  const arrayBuffer = doc.output("arraybuffer");
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  downloadBlob(filename, blob);
}

/* =========================
   UI bits
========================= */

function Icon({ name = "file" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" };
  const stroke = GOLD;

  if (name === "pdf") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke={stroke} strokeWidth="1.6" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke={stroke} strokeWidth="1.6" />
        <path d="M7.2 17.2h2.2c1.1 0 1.8-.6 1.8-1.6 0-1-.7-1.6-1.8-1.6H7.2v3.2Zm0-1.6h2.0" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
        <path d="M12.5 17.2h1.7c1.4 0 2.3-1 2.3-2.4 0-1.4-.9-2.4-2.3-2.4h-1.7v4.8Z" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "excel") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke={stroke} strokeWidth="1.6" />
        <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke={stroke} strokeWidth="1.6" />
        <path d="M8 14l3 4m0-4l-3 4m6-4h2.5" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden="true">
      <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke={stroke} strokeWidth="1.6" />
      <path d="M14 3v4a1 1 0 0 0 1 1h4" stroke={stroke} strokeWidth="1.6" />
      <path d="M7.5 12.6h9M7.5 15.6h7.2" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PillButton({ children, onClick, disabled, tone = "gold", title, icon }) {
  return (
    <button
      className={cx("pp-btn", tone === "ghost" && "pp-btn--ghost")}
      onClick={disabled ? undefined : onClick}
      disabled={!!disabled}
      title={title}
      type="button"
    >
      {icon ? <span className="pp-btn__icon">{icon}</span> : null}
      <span className="pp-btn__label">{children}</span>
    </button>
  );
}

const MONTH_OPTIONS = [
  { v: "ALL", label: "Todos" },
  { v: 1, label: "Jan" },
  { v: 2, label: "Fev" },
  { v: 3, label: "Mar" },
  { v: 4, label: "Abr" },
  { v: 5, label: "Mai" },
  { v: 6, label: "Jun" },
  { v: 7, label: "Jul" },
  { v: 8, label: "Ago" },
  { v: 9, label: "Set" },
  { v: 10, label: "Out" },
  { v: 11, label: "Nov" },
  { v: 12, label: "Dez" },
];

const DOW_OPTIONS = [
  { v: "ALL", label: "Todos" },
  { v: 0, label: "Dom" },
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
];

const POS_OPTIONS = [
  { v: "ALL", label: "Todos" },
  { v: 1, label: "1º" },
  { v: 2, label: "2º" },
  { v: 3, label: "3º" },
  { v: 4, label: "4º" },
  { v: 5, label: "5º" },
  { v: 6, label: "6º" },
  { v: 7, label: "7º" },
];

export default function Downloads() {
  const [ufUi, setUfUi] = useState("RJ");
  const ufQueryKey = useMemo(() => normalizeUfToQueryKey(ufUi), [ufUi]);
  const label = useMemo(() => lotteryLabelFromKey(ufQueryKey || ufUi), [ufQueryKey, ufUi]);

  const [bounds, setBounds] = useState({ minDate: "", maxDate: "" });

  // ✅ estados podem iniciar “fora” do bounds, mas vamos normalizar assim que bounds chegar
  const [dateFrom, setDateFrom] = useState(() => todayYMDLocal());
  const [dateTo, setDateTo] = useState(() => todayYMDLocal());

  const [fMonth, setFMonth] = useState("ALL");
  const [fDay, setFDay] = useState("ALL");
  const [fDow, setFDow] = useState("ALL");
  const [fHour, setFHour] = useState("ALL");
  const [fAnimalGrupo, setFAnimalGrupo] = useState("ALL");
  const [fPos, setFPos] = useState("ALL");

  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState("");

  useEffect(() => {
    let alive = true;

    async function run() {
      setExportError("");
      try {
        const u = safeStr(ufQueryKey);
        if (!u) return;

        const b = await getKingBoundsByUf({ uf: u });

        const bMin = safeStr(b?.minYmd || b?.minDate || b?.min || "");
        const bMax = safeStr(b?.maxYmd || b?.maxDate || b?.max || "");

        if (!alive) return;

        const minDate = isYMD(bMin) ? bMin : "";
        const maxDate = isYMD(bMax) ? bMax : "";

        setBounds({ minDate, maxDate });

        // ✅ NORMALIZA datas assim que bounds chega (fix do bug do print)
        setDateFrom((prev) => {
          const r = normalizeRangeWithBounds(prev, dateTo, minDate, maxDate);
          return r.from;
        });
        setDateTo((prev) => {
          const r = normalizeRangeWithBounds(dateFrom, prev, minDate, maxDate);
          return r.to;
        });
      } catch {
        // bounds é opcional
      }
    }

    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ufQueryKey]);

  // ✅ sempre use bounds atuais para normalizar range nas ações/export
  const normalizeRange = useCallback(() => {
    return normalizeRangeWithBounds(dateFrom, dateTo, bounds?.minDate, bounds?.maxDate);
  }, [dateFrom, dateTo, bounds?.minDate, bounds?.maxDate]);

  // ✅ handlers que impedem “De > Até” e mantêm dentro do bounds
  const onChangeFrom = useCallback(
    (v) => {
      const { from, to } = normalizeRangeWithBounds(v, dateTo, bounds?.minDate, bounds?.maxDate);
      setDateFrom(from);
      setDateTo(to);
    },
    [dateTo, bounds?.minDate, bounds?.maxDate]
  );

  const onChangeTo = useCallback(
    (v) => {
      const { from, to } = normalizeRangeWithBounds(dateFrom, v, bounds?.minDate, bounds?.maxDate);
      setDateFrom(from);
      setDateTo(to);
    },
    [dateFrom, bounds?.minDate, bounds?.maxDate]
  );

  const animalOptions = useMemo(() => {
    const opts = [{ v: "ALL", label: "Todos" }];
    for (let g = 1; g <= 25; g += 1) {
      const name = safeStr(getAnimalLabel?.(g) || "");
      opts.push({ v: String(g), label: `G${pad2(g)} • ${name || "—"}` });
    }
    return opts;
  }, []);

  const hourOptions = useMemo(() => {
    const base = ["ALL", "09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
    const uniq = Array.from(new Set(base));
    return uniq.map((h) => (h === "ALL" ? { v: "ALL", label: "Todos" } : { v: h, label: h }));
  }, []);

  const applyFiltersToRows = useCallback(
    (rows) => {
      const monthN = fMonth === "ALL" ? null : Number(fMonth);
      const dayN = fDay === "ALL" ? null : Number(fDay);
      const dowN = fDow === "ALL" ? null : Number(fDow);
      const hour = fHour === "ALL" ? null : toHourBucket(fHour);
      const grupoN = fAnimalGrupo === "ALL" ? null : Number(fAnimalGrupo);
      const posN = fPos === "ALL" ? null : Number(fPos);

      return rows.filter((r) => {
        if (monthN != null && Number(r.month) !== monthN) return false;
        if (dayN != null && Number(r.day) !== dayN) return false;
        if (dowN != null && Number(r.dow) !== dowN) return false;
        if (hour && toHourBucket(r.hour) !== hour) return false;
        if (grupoN != null && Number(r.grupo) !== grupoN) return false;
        if (posN != null && Number(r.pos) !== posN) return false;
        return true;
      });
    },
    [fMonth, fDay, fDow, fHour, fAnimalGrupo, fPos]
  );

  const buildRowsFromDraws = useCallback((draws) => {
    const list = Array.isArray(draws) ? draws : [];
    const out = [];

    for (const d of list) {
      const ymd = pickDrawYMD(d);
      if (!isYMD(ymd)) continue;

      const hour = toHourBucket(pickDrawHour(d));
      const prizes = Array.isArray(d?.prizes) ? d.prizes : [];
      if (!prizes.length) continue;

      for (const p of prizes) {
        const pos = guessPrizePos(p);
        const grupo = guessPrizeGrupo(p);
        if (!Number.isFinite(Number(pos)) || !Number.isFinite(Number(grupo))) continue;

        const milhar = pickPrizeMilhar4(p) || "";
        const animal = safeStr(getAnimalLabel?.(Number(grupo)) || "");
        const dz = milhar ? getDezena2(milhar) : "";
        const cen = milhar ? getCentena3(milhar) : "";

        out.push({
          ymd,
          dateBR: ymdToBR(ymd),
          month: getMonthNum(ymd) || "",
          day: getDayNum(ymd) || "",
          dow: getDowKey(ymd),
          hour: hour || "",
          pos: Number(pos),
          grupo: Number(grupo),
          animal,
          milhar,
          centena: cen,
          dezena: dz,
        });
      }
    }

    return out;
  }, []);

  const buildMetaLines = useCallback(() => {
    const { from, to } = normalizeRange();
    const lines = [];
    lines.push(`UF: ${safeStr(ufUi).toUpperCase()} • ${label}`);
    lines.push(`Período: ${ymdToBR(from)} → ${ymdToBR(to)}`);

    const f = [];
    if (fMonth !== "ALL") f.push(`Mês: ${String(fMonth).padStart(2, "0")}`);
    if (fDay !== "ALL") f.push(`Dia: ${String(fDay).padStart(2, "0")}`);
    if (fDow !== "ALL")
      f.push(`Semana: ${DOW_OPTIONS.find((x) => String(x.v) === String(fDow))?.label || fDow}`);
    if (fHour !== "ALL") f.push(`Horário: ${toHourBucket(fHour)}`);
    if (fAnimalGrupo !== "ALL") {
      const g = Number(fAnimalGrupo);
      f.push(`Animal: G${pad2(g)} ${safeStr(getAnimalLabel?.(g) || "")}`);
    }
    if (fPos !== "ALL") f.push(`Posição: ${fPos}º`);
    if (f.length) lines.push(`Filtros: ${f.join(" • ")}`);
    else lines.push(`Filtros: Todos`);

    return lines;
  }, [normalizeRange, ufUi, label, fMonth, fDay, fDow, fHour, fAnimalGrupo, fPos]);

  const runExport = useCallback(
    async (type) => {
      const u = safeStr(ufQueryKey);
      if (!u) return;

      const { from, to } = normalizeRange();

      setExportLoading(true);
      setExportError("");

      try {
        const out = await getKingResultsByRange({
          uf: u,
          dateFrom: from,
          dateTo: to,
          closeHour: null,
          positions: null,
          mode: "detailed",
        });

        const draws = Array.isArray(out) ? out : [];
        const rows = buildRowsFromDraws(draws);
        const filteredRows = applyFiltersToRows(rows);

        if (!filteredRows.length) {
          setExportError("Sem dados para exportar com os filtros atuais.");
          return;
        }

        filteredRows.sort((a, b) => {
          const da = safeStr(a.ymd);
          const db = safeStr(b.ymd);
          if (da !== db) return da.localeCompare(db);
          const ha = safeStr(a.hour);
          const hb = safeStr(b.hour);
          if (ha !== hb) return ha.localeCompare(hb);
          return Number(a.pos) - Number(b.pos);
        });

        const columns = ["Data", "Horário", "Posição", "Grupo", "Animal", "Milhar", "Centena", "Dezena"];
        const data = filteredRows.map((r) => [
          r.dateBR,
          r.hour || "",
          `${r.pos}º`,
          `G${pad2(r.grupo)}`,
          r.animal || "",
          r.milhar || "",
          r.centena || "",
          r.dezena || "",
        ]);

        const metaLines = buildMetaLines();
        const baseName = `resultados_${safeStr(ufUi).toLowerCase()}_${from}_a_${to}`;

        if (type === "pdf") {
          try {
            await exportPdfReal({
              filename: `${baseName}.pdf`,
              title: "Palpitaco • Resultados (Aparições)",
              metaLines,
              columns,
              rows: data,
              orientation: "landscape",
            });
          } catch (e) {
            setExportError(
              "PDF real requer as dependências 'jspdf' e 'jspdf-autotable'.\n\n" +
                "Rode:\n" +
                "npm i jspdf jspdf-autotable\n\n" +
                `Detalhe: ${String(e?.message || e || "").slice(0, 260)}`
            );
          }
          return;
        }

        try {
          await exportExcelXlsx({
            filename: `${baseName}.xlsx`,
            title: "Palpitaco • Resultados (Aparições)",
            metaLines,
            columns,
            rows: data,
            textCols: [5, 6, 7],
            sheetName: "resultados",
          });
        } catch (e) {
          exportExcelXls({
            filename: `${baseName}.xls`,
            title: "Palpitaco • Resultados (Aparições)",
            metaLines,
            columns,
            rows: data,
            textCols: [5, 6, 7],
          });

          setExportError(
            "Excel .xlsx requer a dependência 'xlsx'. O sistema baixou um fallback .xls.\n\n" +
              "Para ativar .xlsx definitivo, rode:\n" +
              "npm i xlsx\n\n" +
              `Detalhe: ${String(e?.message || e || "").slice(0, 260)}`
          );
        }
      } catch (e) {
        setExportError(String(e?.message || e || "Falha ao gerar exportação."));
      } finally {
        setExportLoading(false);
      }
    },
    [ufQueryKey, ufUi, normalizeRange, buildRowsFromDraws, applyFiltersToRows, buildMetaLines]
  );

  const { from: fromSafe, to: toSafe } = useMemo(() => normalizeRange(), [normalizeRange]);

  return (
    <div className="pp-wrap">
      <style>{`
        .pp-wrap{ padding: 22px; }

        .pp-panel{
          border-radius: 18px;
          border: 1px solid ${GOLD_SOFT};
          background: ${BLACK_GLASS};
          box-shadow: 0 20px 60px rgba(0,0,0,0.35);
          padding: 18px;
          color: ${WHITE};
          overflow: hidden;
        }

        .pp-top{
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          flex-wrap: wrap;
        }

        .pp-title{
          font-size: 22px;
          font-weight: 950;
          letter-spacing: 0.4px;
          line-height: 1.1;
          text-transform: uppercase;
        }

        .pp-sub{
          margin-top: 10px;
          line-height: 1.55;
          color: ${WHITE_78};
          font-size: 13px;
          max-width: 860px;
        }

        .pp-topActions{
          display:flex;
          gap: 10px;
          align-items:center;
          justify-content: flex-end;
          flex-wrap: wrap;
          margin-top: 2px;
        }

        /* ✅ FIX: no mobile não duplica botões */
        @media (max-width: 740px){
          .pp-topActions{ display:none; }
        }

        .pp-export{
          margin-top: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.26);
          box-shadow: 0 18px 44px rgba(0,0,0,0.26);
          padding: 14px;
        }

        .pp-exportBar{
          display: grid;
          grid-template-columns:
            minmax(84px, 0.70fr)
            minmax(122px, 1.05fr)
            minmax(122px, 1.05fr)
            minmax(98px, 0.85fr)
            minmax(86px, 0.75fr)
            minmax(98px, 0.85fr)
            minmax(98px, 0.85fr)
            minmax(170px, 1.55fr)
            minmax(110px, 0.95fr);
          gap: 12px;
          align-items: start;
          width: 100%;
          overflow: hidden;
        }

        @media (max-width: 1120px){
          .pp-exportBar{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 740px){
          .pp-exportBar{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 520px){
          .pp-exportBar{ grid-template-columns: 1fr; }
        }

        .pp-field{
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 7px;
        }

        .pp-fieldLabel{
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.2px;
          color: ${WHITE_60};
          margin: 0;
          line-height: 1;
          text-align: center;
          width: 100%;
          user-select: none;
        }

        .pp-input, .pp-select{
          height: 38px;
          width: 100%;
          min-width: 0;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.32);
          color: ${WHITE};
          padding: 0 12px;
          outline: none;
          font-weight: 900;
          letter-spacing: 0.2px;
          font-size: 12.5px;
          box-sizing: border-box;
          text-align: center;
        }

        .pp-select{
          text-align-last: center;
          -moz-text-align-last: center;
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
          padding-left: 12px;
          padding-right: 30px;
        }

        .pp-input[type="date"]{
          padding-left: 12px;
          padding-right: 12px;
        }

        .pp-input[type="date"]::-webkit-datetime-edit{
          text-align: center;
          width: 100%;
        }
        .pp-input[type="date"]::-webkit-datetime-edit-fields-wrapper{
          display: flex;
          justify-content: center;
          width: 100%;
        }
        .pp-input[type="date"]::-webkit-datetime-edit-text{
          padding: 0 2px;
        }
        .pp-input[type="date"]::-webkit-calendar-picker-indicator{
          opacity: 0.85;
          margin: 0;
          padding: 0;
        }

        .pp-input:focus, .pp-select:focus{
          border-color: rgba(202,166,75,0.34);
          box-shadow: 0 0 0 3px rgba(202,166,75,0.12);
        }

        .pp-btn{
          border: 1px solid ${GOLD_SOFT2};
          background: rgba(0,0,0,0.18);
          color: ${WHITE};
          border-radius: 999px;
          padding: 10px 12px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 900;
          letter-spacing: 0.2px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.22);
          transition: transform .12s ease, border-color .12s ease, background .12s ease, opacity .12s ease;
          user-select: none;
          white-space: nowrap;
        }
        .pp-btn:active{ transform: translateY(1px); }
        .pp-btn:hover{ border-color: rgba(202,166,75,0.36); background: rgba(0,0,0,0.22); }
        .pp-btn:disabled{ opacity: .55; cursor: not-allowed; box-shadow: none; }
        .pp-btn--ghost{ border-color: rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); }
        .pp-btn--ghost:hover{ border-color: rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); }
        .pp-btn__icon{ display:flex; align-items:center; }

        .pp-exportActions{
          display: none;
          margin-top: 12px;
          gap: 10px;
          align-items:center;
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        @media (max-width: 740px){
          .pp-exportActions{ display: flex; }
        }

        .pp-stateBox{
          margin-top: 12px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.22);
          border-radius: 16px;
          padding: 12px;
          color: ${WHITE_78};
          font-weight: 850;
          font-size: 12.5px;
          line-height: 1.45;
        }
      `}</style>

      <div className="pp-panel">
        <div className="pp-top">
          <div>
            <div className="pp-title">RESULTADOS</div>
            <div className="pp-sub">
              {bounds?.minDate || bounds?.maxDate ? (
                <>
                  Base disponível:{" "}
                  <span style={{ color: GOLD, fontWeight: 950 }}>
                    {bounds?.minDate ? ymdToBR(bounds.minDate) : "—"} →{" "}
                    {bounds?.maxDate ? ymdToBR(bounds.maxDate) : "—"}
                  </span>
                  .
                </>
              ) : null}
            </div>
          </div>

          <div className="pp-topActions">
            <PillButton
              tone="ghost"
              disabled={exportLoading}
              title="Baixar PDF (real)"
              onClick={() => runExport("pdf")}
              icon={<Icon name="pdf" />}
            >
              Baixar PDF
            </PillButton>

            <PillButton
              tone="gold"
              disabled={exportLoading}
              title="Baixar Excel (.xlsx)"
              onClick={() => runExport("excel")}
              icon={<Icon name="excel" />}
            >
              Baixar Excel
            </PillButton>
          </div>
        </div>

        <div className="pp-export">
          <div className="pp-exportBar">
            <div className="pp-field">
              <div className="pp-fieldLabel">UF</div>
              <select className="pp-select" value={ufUi} onChange={(e) => setUfUi(e.target.value)}>
                <option value="RJ">RJ</option>
              </select>
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">De</div>
              <input
                className="pp-input"
                type="date"
                value={fromSafe}
                min={bounds?.minDate || undefined}
                max={bounds?.maxDate || undefined}
                onChange={(e) => onChangeFrom(e.target.value)}
              />
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Até</div>
              <input
                className="pp-input"
                type="date"
                value={toSafe}
                min={bounds?.minDate || undefined}
                max={bounds?.maxDate || undefined}
                onChange={(e) => onChangeTo(e.target.value)}
              />
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Mês</div>
              <select className="pp-select" value={String(fMonth)} onChange={(e) => setFMonth(e.target.value)}>
                {MONTH_OPTIONS.map((m) => (
                  <option key={`m_${m.v}`} value={String(m.v)}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Dia</div>
              <select className="pp-select" value={String(fDay)} onChange={(e) => setFDay(e.target.value)}>
                <option value="ALL">Todos</option>
                {Array.from({ length: 31 }).map((_, i) => {
                  const d = i + 1;
                  return (
                    <option key={`d_${d}`} value={String(d)}>
                      {pad2(d)}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Semana</div>
              <select className="pp-select" value={String(fDow)} onChange={(e) => setFDow(e.target.value)}>
                {DOW_OPTIONS.map((x) => (
                  <option key={`dow_${x.v}`} value={String(x.v)}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Horário</div>
              <select className="pp-select" value={String(fHour)} onChange={(e) => setFHour(e.target.value)}>
                {hourOptions.map((h) => (
                  <option key={`h_${h.v}`} value={String(h.v)}>
                    {h.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Animal</div>
              <select
                className="pp-select"
                value={String(fAnimalGrupo)}
                onChange={(e) => setFAnimalGrupo(e.target.value)}
              >
                {animalOptions.map((a) => (
                  <option key={`a_${a.v}`} value={String(a.v)}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pp-field">
              <div className="pp-fieldLabel">Posição</div>
              <select className="pp-select" value={String(fPos)} onChange={(e) => setFPos(e.target.value)}>
                {POS_OPTIONS.map((p) => (
                  <option key={`p_${p.v}`} value={String(p.v)}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pp-exportActions">
            <PillButton
              tone="ghost"
              disabled={exportLoading}
              title="Baixar PDF (real)"
              onClick={() => runExport("pdf")}
              icon={<Icon name="pdf" />}
            >
              Baixar PDF
            </PillButton>

            <PillButton
              tone="gold"
              disabled={exportLoading}
              title="Baixar Excel (.xlsx)"
              onClick={() => runExport("excel")}
              icon={<Icon name="excel" />}
            >
              Baixar Excel
            </PillButton>
          </div>

          {(exportLoading || exportError) && (
            <div className="pp-stateBox">
              {exportLoading ? (
                <>
                  Gerando exportação…{" "}
                  <span style={{ color: GOLD, fontWeight: 950 }}>
                    ({safeStr(ufUi).toUpperCase()} • {label})
                  </span>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 1100, marginBottom: 6, color: WHITE }}>Aviso / Erro</div>
                  <div style={{ opacity: 0.92, whiteSpace: "pre-wrap" }}>{exportError}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
