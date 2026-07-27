from pathlib import Path
import sys

target = Path(r"src/pages/Downloads/Downloads.jsx")

if not target.exists():
    raise SystemExit(f"ERRO: arquivo não encontrado: {target}")

text = target.read_text(encoding="utf-8")

old_fetch_block = '''        const filteredRows = Array.isArray(previewRows) ? previewRows : [];

        if (!filteredRows.length) {
          setExportError("Consulte os resultados antes de exportar.");
          return;
        }
'''

new_fetch_block = '''        const filteredRows = await fetchFilteredRows();

        if (!filteredRows.length) {
          setExportError("Sem dados para exportar com os filtros atuais.");
          return;
        }
'''

old_dependencies = '''    [ufQueryKey, ufUi, normalizeRange, previewRows, buildMetaLines]
'''

new_dependencies = '''    [ufQueryKey, ufUi, normalizeRange, fetchFilteredRows, buildMetaLines]
'''

fetch_count = text.count(old_fetch_block)
deps_count = text.count(old_dependencies)

if fetch_count != 1:
    raise SystemExit(
        "ERRO: bloco de dependência da prévia não foi localizado exatamente uma vez. "
        f"Ocorrências: {fetch_count}"
    )

if deps_count != 1:
    raise SystemExit(
        "ERRO: array de dependências de runExport não foi localizado exatamente uma vez. "
        f"Ocorrências: {deps_count}"
    )

updated = text.replace(old_fetch_block, new_fetch_block, 1)
updated = updated.replace(old_dependencies, new_dependencies, 1)

if 'setExportError("Consulte os resultados antes de exportar.");' in updated:
    raise SystemExit("ERRO: a mensagem antiga ainda permanece no arquivo.")

if "const filteredRows = await fetchFilteredRows();" not in updated:
    raise SystemExit("ERRO: a nova consulta independente não foi aplicada.")

target.write_text(updated, encoding="utf-8", newline="\n")

print("PATCH_OK")
print(f"Arquivo alterado: {target}")
print("Exportação agora consulta os dados diretamente.")
print("A prévia continua independente para visualização.")
