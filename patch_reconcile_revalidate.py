from pathlib import Path

p = Path("backend/scripts/reconcileKingFirestore.js")
txt = p.read_text(encoding="utf-8")

old = '''  let fixed = false;

  if (needsFix && fix) {
    await runImport({ date: ymd, lotteryKey });
    fixed = true;
  }

  return {
    ymd,
    sourceHours: Array.from(sourceByHour.keys()).sort(),
    firestoreHours: Array.from(firestoreByHour.keys()).sort(),
    missing,
    incomplete,
    status: needsFix ? (fix ? "FIXED_ATTEMPTED" : "NEEDS_FIX") : "OK",
    fixed,
  };'''

new = '''  let fixed = false;

  if (needsFix && fix) {
    await runImport({ date: ymd, lotteryKey });
    fixed = true;

    const afterFirestoreByHour = await readFirestoreDay(db, ymd, lotteryKey);
    const afterMissing = [];
    const afterIncomplete = [];

    for (const [hour, src] of sourceByHour.entries()) {
      const dbRow = afterFirestoreByHour.get(hour);

      if (!dbRow) {
        afterMissing.push(hour);
      } else if (dbRow.prizes < src.prizes) {
        afterIncomplete.push({
          hour,
          firestorePrizes: dbRow.prizes,
          sourcePrizes: src.prizes,
        });
      }
    }

    const stillNeedsFix = afterMissing.length > 0 || afterIncomplete.length > 0;

    return {
      ymd,
      sourceHours: Array.from(sourceByHour.keys()).sort(),
      firestoreHours: Array.from(afterFirestoreByHour.keys()).sort(),
      missing: afterMissing,
      incomplete: afterIncomplete,
      status: stillNeedsFix ? "FIX_FAILED" : "FIXED",
      fixed,
    };
  }

  return {
    ymd,
    sourceHours: Array.from(sourceByHour.keys()).sort(),
    firestoreHours: Array.from(firestoreByHour.keys()).sort(),
    missing,
    incomplete,
    status: needsFix ? "NEEDS_FIX" : "OK",
    fixed,
  };'''

if old not in txt:
    raise SystemExit("Trecho esperado não encontrado. Não alterei o arquivo.")

txt = txt.replace(old, new, 1)
p.write_text(txt, encoding="utf-8")
print("OK: reconcileKingFirestore agora revalida após --fix.")
