from pathlib import Path

p = Path("backend/routes/pitacoResults.js")
txt = p.read_text(encoding="utf-8")

old = """      const slotsSummary = {
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

new = """      const slotsSummary = {
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

count = txt.count(old)

if count != 2:
    raise SystemExit(f"Esperava encontrar 2 blocos slotsSummary, encontrei {count}.")

txt = txt.replace(old, new)

p.write_text(txt, encoding="utf-8")

print("OK - slotsSummary enriquecido nos dois retornos da API.")
