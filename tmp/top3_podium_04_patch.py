from pathlib import Path
import sys

path = Path(r"src/pages/Top3/Top3View.jsx")

raw = path.read_bytes()

old_crlf = (
    b"  const analysis = analyzeTop3Hit(\r\n"
    b"    slotTop3,\r\n"
    b"    resultGrupo,\r\n"
    b"    extractResultMilhar(slot)\r\n"
    b"  );"
)

new_crlf = (
    b"  const officialPodium = getOfficialPodium(slot);\r\n"
    b"\r\n"
    b"  const analysis = analyzeTop3Hit(\r\n"
    b"    slotTop3,\r\n"
    b"    officialPodium\r\n"
    b"  );"
)

old_lf = old_crlf.replace(b"\r\n", b"\n")
new_lf = new_crlf.replace(b"\r\n", b"\n")

count_crlf = raw.count(old_crlf)
count_lf = raw.count(old_lf)

total = count_crlf + count_lf

if total != 1:
    print(f"STATUS=ERRO")
    print(f"OCORRENCIAS_ENCONTRADAS={total}")
    print("A substituicao foi cancelada porque era esperada exatamente 1 ocorrencia.")
    sys.exit(1)

if count_crlf == 1:
    updated = raw.replace(old_crlf, new_crlf, 1)
else:
    updated = raw.replace(old_lf, new_lf, 1)

path.write_bytes(updated)

print("STATUS=OK")
print("ARQUIVO_ALTERADO=src/pages/Top3/Top3View.jsx")
print("TIMELINE_PODIUM_PATCHED=1")
