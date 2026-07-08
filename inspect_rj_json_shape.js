const fs = require("fs");
const path = require("path");

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.toLowerCase().endsWith(".json")) out.push(p);
  }
  return out;
}

const files = walk(path.join(process.cwd(), "backend"))
  .filter(p => ["PT_RIO", "RIO", "RJ"].some(k => p.toUpperCase().includes(k)))
  .slice(0, 20);

console.log("Arquivos inspecionados:", files.length);

for (const file of files) {
  console.log("\n==============================");
  console.log(path.relative(process.cwd(), file));

  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log("Tipo raiz:", Array.isArray(data) ? "array" : typeof data);
    console.log("Chaves raiz:", Array.isArray(data) ? "array length " + data.length : Object.keys(data).slice(0, 30));

    const sample =
      Array.isArray(data) ? data[0] :
      Array.isArray(data?.draws) ? data.draws[0] :
      Array.isArray(data?.results) ? data.results[0] :
      Array.isArray(data?.items) ? data.items[0] :
      data;

    console.log("Amostra:", JSON.stringify(sample, null, 2).slice(0, 2500));
  } catch (e) {
    console.log("Erro:", e.message);
  }
}
