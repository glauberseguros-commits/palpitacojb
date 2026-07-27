from pathlib import Path
import sys

target = Path("src/pages/Downloads/Downloads.jsx")

if not target.exists():
    print(f"ERRO: arquivo não encontrado: {target}")
    sys.exit(1)

text = target.read_text(encoding="utf-8")
original = text

replacements = [
    (
        '''const UF_TO_LOTTERY_KEY = { RJ: "PT_RIO", FEDERAL: "FEDERAL", BR: "FEDERAL" };''',
        '''const UF_TO_LOTTERY_KEY = {
  RJ: "PT_RIO",
  FEDERAL: "FEDERAL",
  BR: "FEDERAL",
  LOOK: "LOOK",
  NACIONAL: "NACIONAL",
};'''
    ),
    (
        '''function lotteryLabelFromKey(key) {
  const s = safeStr(key).toUpperCase();
  if (s === "PT_RIO") return "RIO";
  if (s === "FEDERAL") return "FEDERAL";
  if (s.length === 2) return s;
  const parts = s.split("_");
  return parts[parts.length - 1] || s;
}''',
        '''function lotteryLabelFromKey(key) {
  const s = safeStr(key).toUpperCase();
  if (s === "PT_RIO") return "RIO";
  if (s === "FEDERAL") return "FEDERAL";
  if (s === "LOOK") return "LOOK";
  if (s === "NACIONAL") return "NACIONAL";
  if (s.length === 2) return s;
  const parts = s.split("_");
  return parts[parts.length - 1] || s;
}'''
    ),
    (
        '''  const hourOptions = useMemo(() => {
    const base = ["ALL", "09:00", "11:00", "14:00", "16:00", "18:00", "21:00"];
    const uniq = Array.from(new Set(base));
    return uniq.map((h) => (h === "ALL" ? { v: "ALL", label: "Todos" } : { v: h, label: h }));
  }, []);''',
        '''  const hourOptions = useMemo(() => {
    const lotteryKey = safeStr(ufQueryKey).toUpperCase();

    const hoursByLottery = {
      PT_RIO: ["09:00", "11:00", "14:00", "16:00", "18:00", "19:00", "21:00"],
      FEDERAL: ["19:00", "20:00"],
      LOOK: ["07:00", "09:00", "11:00", "14:00", "16:00", "18:00", "21:00", "23:00"],
      NACIONAL: ["02:00", "08:00", "10:00", "12:00", "15:00", "17:00", "21:00", "23:00"],
    };

    const base = ["ALL", ...(hoursByLottery[lotteryKey] || [])];
    const uniq = Array.from(new Set(base));

    return uniq.map((h) =>
      h === "ALL"
        ? { v: "ALL", label: "Todos" }
        : { v: h, label: h }
    );
  }, [ufQueryKey]);'''
    ),
    (
        '''    // ✅ mais “humano”: RJ • RIO
    const ufLabel = safeStr(ufUi).toUpperCase() === "PT_RIO" ? "RJ" : safeStr(ufUi).toUpperCase() === "FEDERAL" ? "BR" : safeStr(ufUi).toUpperCase();
    lines.push(`UF: ${ufLabel} • ${label}`);''',
        '''    const lotteryKey = safeStr(ufUi).toUpperCase();
    const lotteryUiLabel =
      lotteryKey === "PT_RIO"
        ? "RJ"
        : lotteryKey === "FEDERAL"
        ? "Federal"
        : lotteryKey === "LOOK"
        ? "LOOK"
        : lotteryKey === "NACIONAL"
        ? "Nacional"
        : lotteryKey;

    lines.push(`Loteria: ${lotteryUiLabel} • ${label}`);'''
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        print(
            f"ERRO: âncora estrutural encontrada {count} vez(es), esperado: 1.\n"
            f"INÍCIO DA ÂNCORA:\n{old[:240]}"
        )
        sys.exit(1)

    text = text.replace(old, new, 1)

selector_old = '''                <option value="PT_RIO">RJ</option>
                <option value="FEDERAL">Federal</option>'''

selector_new = '''                <option value="PT_RIO">RJ</option>
                <option value="FEDERAL">Federal</option>
                <option value="LOOK">LOOK</option>
                <option value="NACIONAL">Nacional</option>'''

selector_count = text.count(selector_old)

if selector_count < 1:
    print("ERRO: seletor de loterias não encontrado.")
    sys.exit(1)

text = text.replace(selector_old, selector_new)

state_anchor = '''  const [fPos, setFPos] = useState("ALL");

  const [exportLoading, setExportLoading] = useState(false);'''

state_replacement = '''  const [fPos, setFPos] = useState("ALL");

  useEffect(() => {
    setFHour("ALL");
    setPreviewRows([]);
    setPreviewError("");
    setPreviewPage(1);
  }, [ufQueryKey]);

  const [exportLoading, setExportLoading] = useState(false);'''

state_count = text.count(state_anchor)

if state_count != 1:
    print(
        f"ERRO: âncora para reset do horário encontrada {state_count} vez(es), esperado: 1."
    )
    sys.exit(1)

text = text.replace(state_anchor, state_replacement, 1)

if text == original:
    print("ERRO: nenhuma alteração foi aplicada.")
    sys.exit(1)

required = [
    '<option value="LOOK">LOOK</option>',
    '<option value="NACIONAL">Nacional</option>',
    'LOOK: ["07:00", "09:00", "11:00", "14:00", "16:00", "18:00", "21:00", "23:00"]',
    'NACIONAL: ["02:00", "08:00", "10:00", "12:00", "15:00", "17:00", "21:00", "23:00"]',
    'setFHour("ALL");',
]

for item in required:
    if item not in text:
        print(f"ERRO: validação final falhou: {item}")
        sys.exit(1)

target.write_text(text, encoding="utf-8", newline="\n")

print("OK: Downloads.jsx atualizado.")
print(f"Seletores atualizados: {selector_count}")
print("Loterias: PT_RIO, FEDERAL, LOOK e NACIONAL")
