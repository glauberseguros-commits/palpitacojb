from pathlib import Path
import re

p = Path("backend/routes/pitacoResults.js")
txt = p.read_text(encoding="utf-8")

pattern = re.compile(
r'''      const slotsSummary = \{
        mode: expectedBase\?\.mode \|\| "none",
        scheduleFile: !!expectedBase\?\.scheduleFile,
        scheduleHard: baseHard\.length,
        scheduleSoft: baseSoft\.length,
        scheduleAll: scheduleAll\.length,
        expectedHard: expectedHard\.length,
        expectedSoft: expectedSoft\.length,
        presentHours: presentHours\.length,
        removedHard: removedHardApplied\.size,
        removedSoft: removedSoftApplied\.size,
        missingHard: slots\.filter\(\(s\) => s\.status === "missing"\)\.length,
        missingSoft: slots\.filter\(\(s\) => s\.status === "soft_missing"\)\.length,
      \};''',
re.MULTILINE
)

new = '''      const slotsSummary = {
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
      };'''

txt2, count = pattern.subn(new, txt)

if count < 1:
    raise SystemExit(f"Nenhum bloco slotsSummary compatível encontrado. count={count}")

p.write_text(txt2, encoding="utf-8")
print(f"OK - slotsSummary enriquecido em {count} bloco(s).")
