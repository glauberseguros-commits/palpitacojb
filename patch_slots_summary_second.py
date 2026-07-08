from pathlib import Path

p = Path("backend/routes/pitacoResults.js")
txt = p.read_text(encoding="utf-8")

anchor = """    const slotsSummary = {
      mode: expectedBase?.mode || "none",
      scheduleFile: !!expectedBase?.scheduleFile,
      scheduleHard: baseHard.length,
      scheduleSoft: baseSoft.length,
      scheduleAll: scheduleAll.length,
      expectedHard: expectedHard.length,
      expectedSoft: expectedSoft.length,
      presentHours: presentHours.length,
      removedHard: removedHardApplied.size,
      removedSoft: removedSoftApplied.size,
      missingHard: slots.filter((s) => s.status === "missing").length,
      missingSoft: slots.filter((s) => s.status === "soft_missing").length,
    };"""

replacement = """    const slotsSummary = {
      mode: expectedBase?.mode || "none",
      scheduleFile: !!expectedBase?.scheduleFile,
      scheduleHard: baseHard.length,
      scheduleSoft: baseSoft.length,
      scheduleAll: scheduleAll.length,
      expectedHard: expectedHard.length,
      expectedSoft: expectedSoft.length,
      expectedTotal: expectedHard.length + expectedSoft.length,
      presentHours: presentHours.length,
      foundTotal: presentHours.length,
      removedHard: removedHardApplied.size,
      removedSoft: removedSoftApplied.size,
      missingHard: slots.filter((s) => s.status === "missing").length,
      missingSoft: slots.filter((s) => s.status === "soft_missing").length,
      missingTotal:
        slots.filter((s) => s.status === "missing").length +
        slots.filter((s) => s.status === "soft_missing").length,
      completionPct:
        expectedHard.length + expectedSoft.length
          ? Number(
              (
                (presentHours.length /
                  (expectedHard.length + expectedSoft.length)) *
                100
              ).toFixed(1)
            )
          : 100,
    };"""

idx = txt.rfind(anchor)

if idx == -1:
    raise SystemExit("Segundo slotsSummary não encontrado.")

txt = txt[:idx] + replacement + txt[idx + len(anchor):]

p.write_text(txt, encoding="utf-8")
print("OK - Segundo slotsSummary atualizado.")
