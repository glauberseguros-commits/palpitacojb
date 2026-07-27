from pathlib import Path
import sys

target = Path("src/services/kingResultsService.js")

text = target.read_text(encoding="utf-8")

anchor_function = '''function normalizeHourLike(value) {
  const s0 = String(value ?? "").trim();
  if (!s0) return "";

  const s = s0.replace(/\\s+/g, "");

  const mhx = s.match(/^(\\d{1,2})(?:h|hs|hr|hrs)$/i);
  if (mhx) return `${pad2(mhx[1])}:00`;

  const mISO = s.match(/^(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?$/);
  if (mISO) return `${pad2(mISO[1])}:${pad2(mISO[2])}`;

  const mHm = s.match(/^(\\d{3,4})$/);
  if (mHm) {
    const hh = String(mHm[1]).slice(0, -2);
    const mm = String(mHm[1]).slice(-2);
    if (/^\\d{1,2}$/.test(hh) && /^\\d{2}$/.test(mm)) {
      return `${pad2(hh)}:${mm}`;
    }
  }

  const m2 = s.match(/^(\\d{1,2})$/);
  if (m2) return `${pad2(m2[1])}:00`;

  return s0.trim();
}
'''

new_function = anchor_function + '''
/**
 * Converte o horário técnico/original da Nacional para o horário
 * comercial exibido e utilizado pelos filtros do sistema.
 *
 * Histórico da fonte:
 * 01:49 -> 02:00
 * 07:49 -> 08:00
 * 09:49 -> 10:00
 * 11:49 -> 12:00
 * 14:49 -> 15:00
 * 16:49 -> 17:00
 * 20:49 -> 21:00
 * 22:49 -> 23:00
 */
function normalizeCloseHourForLottery(lotteryInput, value) {
  const normalized = normalizeHourLike(value);
  if (!normalized) return "";

  const lotteryKey = canonicalScopeKey(lotteryInput);

  if (lotteryKey !== "NACIONAL") {
    return normalized;
  }

  const nacionalHourMap = {
    "01:49": "02:00",
    "07:49": "08:00",
    "09:49": "10:00",
    "11:49": "12:00",
    "14:49": "15:00",
    "16:49": "17:00",
    "20:49": "21:00",
    "22:49": "23:00",
  };

  return nacionalHourMap[normalized] || normalized;
}
'''

if "function normalizeCloseHourForLottery(" not in text:
    if anchor_function not in text:
        print("ERRO: função normalizeHourLike não localizada.")
        sys.exit(1)

    text = text.replace(anchor_function, new_function, 1)

old_map_block = '''function mapDrawDoc(doc) {
  const d = doc.data();

  const ymd = d.ymd || normalizeToYMD(getDocDateRaw(d));
  const hourNorm = normalizeHourLike(
    d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? ""
  );

  const embeddedPrizes = Array.isArray(d.prizes) && d.prizes.length > 0 ? d.prizes : null;

  const ufRaw = d.uf ?? null;
  const lotteryKeyRaw = d.lottery_key ?? d.lotteryKey ?? d.lottery ?? null;
'''

new_map_block = '''function mapDrawDoc(doc) {
  const d = doc.data();

  const ymd = d.ymd || normalizeToYMD(getDocDateRaw(d));

  const ufRaw = d.uf ?? null;
  const lotteryKeyRaw = d.lottery_key ?? d.lotteryKey ?? d.lottery ?? null;

  const hourNorm = normalizeCloseHourForLottery(
    lotteryKeyRaw || ufRaw,
    d.close_hour ?? d.closeHour ?? d.hour ?? d.hora ?? ""
  );

  const embeddedPrizes = Array.isArray(d.prizes) && d.prizes.length > 0 ? d.prizes : null;
'''

if new_map_block not in text:
    if old_map_block not in text:
        print("ERRO: bloco mapDrawDoc esperado não localizado.")
        sys.exit(1)

    text = text.replace(old_map_block, new_map_block, 1)

target.write_text(text, encoding="utf-8", newline="\n")

required = [
    'function normalizeCloseHourForLottery(',
    '"01:49": "02:00"',
    '"07:49": "08:00"',
    '"09:49": "10:00"',
    '"11:49": "12:00"',
    '"14:49": "15:00"',
    '"16:49": "17:00"',
    '"20:49": "21:00"',
    '"22:49": "23:00"',
    'const hourNorm = normalizeCloseHourForLottery(',
]

missing = [item for item in required if item not in text]

if missing:
    print("ERRO: validação da correção falhou.")
    for item in missing:
        print("AUSENTE:", item)
    sys.exit(1)

print("PATCH_OK")
print("ARQUIVO:", target)
print("NORMALIZACAO_NACIONAL: 8 horários históricos")
