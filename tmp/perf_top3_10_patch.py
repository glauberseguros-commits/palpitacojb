from pathlib import Path
import re
import sys

file = Path("backend/engine/top3HistoryRepository.js")
text = file.read_text(encoding="utf-8")

old = """async function readFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const months = await listHistoryMonths(
    lotteryKey,
    dependencies
  );

  const draws = [];

  for (const month of months) {
    draws.push(
      ...safeArray(month.draws)
    );
  }

  return deduplicateDraws(draws);
}"""

new = """async function readFullHistory(
  lotteryKey,
  dependencies = {}
) {
  const database = resolveDb(dependencies);

  const key = normalizeLotteryKey(lotteryKey);

  const snap = await historyRootRef(
    database,
    key
  )
    .collection(MONTHS_COLLECTION)
    .orderBy("yearMonth")
    .select("draws")
    .get();

  const draws = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};

    if (Array.isArray(data.draws) && data.draws.length) {
      draws.push(...data.draws);
    }
  }

  return deduplicateDraws(draws);
}"""

if old not in text:
    print("ERRO: readFullHistory() não encontrado.")
    sys.exit(1)

text = text.replace(old, new)

file.write_text(text, encoding="utf-8")

print("PATCH OK")
