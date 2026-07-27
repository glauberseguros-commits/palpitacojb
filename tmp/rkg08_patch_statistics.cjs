const fs = require("fs");

const files = {
  app: "src/App.jsx",
  shell: "src/pages/Dashboard/components/Sidebar/AppShell.jsx",
  icon: "src/pages/Dashboard/components/Sidebar/Icon.jsx",
  page: "src/pages/Statistics/Statistics.jsx",
};

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function write(file, content) {
  fs.writeFileSync(file, content, "utf8");
}

function normalizeLf(content) {
  return String(content).replace(/\r\n/g, "\n");
}

function countOccurrences(content, token) {
  return content.split(token).length - 1;
}

function insertAfterOnce(content, anchor, insertion, label) {
  const count = countOccurrences(content, anchor);

  if (count !== 1) {
    throw new Error(
      `${label}: âncora encontrada ${count} vez(es); esperado 1.`
    );
  }

  return content.replace(anchor, `${anchor}${insertion}`);
}

function insertBeforeOnce(content, anchor, insertion, label) {
  const count = countOccurrences(content, anchor);

  if (count !== 1) {
    throw new Error(
      `${label}: âncora encontrada ${count} vez(es); esperado 1.`
    );
  }

  return content.replace(anchor, `${insertion}${anchor}`);
}

/* =====================================================
   APP.JSX
===================================================== */

let app = normalizeLf(read(files.app));

if (!app.includes('const Statistics = lazy(() => import("./pages/Statistics/Statistics"));')) {
  app = insertAfterOnce(
    app,
    'const Centenas = lazy(() => import("./pages/Centenas/Centenas"));',
    '\nconst Statistics = lazy(() => import("./pages/Statistics/Statistics"));',
    "Importação de Statistics"
  );
}

if (!app.includes('  STATISTICS: "statistics",')) {
  app = insertAfterOnce(
    app,
    '  CENTENAS: "centenas",',
    '\n  STATISTICS: "statistics",',
    "ROUTES.STATISTICS no App"
  );
}

app = app.replace(
  /^\s*STATISTICS:\s*"statistics",\s*$/m,
  '  STATISTICS: "statistics",'
);

if (!app.includes('    case ROUTES.STATISTICS:\n      return "/statistics";')) {
  app = insertAfterOnce(
    app,
    '    case ROUTES.CENTENAS:\n      return "/centenas";',
    '\n    case ROUTES.STATISTICS:\n      return "/statistics";',
    "screenToPath de Statistics"
  );
}

if (!app.includes('  if (p === "/statistics") return ROUTES.STATISTICS;')) {
  app = insertAfterOnce(
    app,
    '  if (p === "/centenas") return ROUTES.CENTENAS;',
    '\n  if (p === "/statistics") return ROUTES.STATISTICS;',
    "pathToScreen de Statistics"
  );
}

if (!app.includes('      case ROUTES.STATISTICS:\n        return <Statistics />;')) {
  app = insertAfterOnce(
    app,
    '      case ROUTES.CENTENAS:\n        return <Centenas />;',
    '\n      case ROUTES.STATISTICS:\n        return <Statistics />;',
    "renderScreen de Statistics"
  );
}

write(files.app, app);

/* =====================================================
   APPSHELL.JSX
===================================================== */

let shell = normalizeLf(read(files.shell));

if (!shell.includes('  STATISTICS: "statistics",')) {
  shell = insertAfterOnce(
    shell,
    '  CENTENAS: "centenas",',
    '\n  STATISTICS: "statistics",',
    "ROUTES.STATISTICS no AppShell"
  );
}

if (!shell.includes(
  '{ key: ROUTES.STATISTICS, icon: "chart", title: "Estatísticas" },'
)) {
  shell = insertAfterOnce(
    shell,
    '    { key: ROUTES.SEARCH, icon: "search", title: "Busca" },',
    '\n    { key: ROUTES.STATISTICS, icon: "chart", title: "Estatísticas" },',
    "Menu Estatísticas"
  );
}

write(files.shell, shell);

/* =====================================================
   ICON.JSX
===================================================== */

let icon = normalizeLf(read(files.icon));

if (!icon.includes('if (name === "chart")')) {
  const chartBlock = `  if (name === "chart") {
    return (
      <svg {...common}>
        <path
          d="M4 20V13h4v7H4Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M10 20V8h4v12h-4Z"
          stroke={gold}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M16 20V4h4v16h-4Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

`;

  icon = insertBeforeOnce(
    icon,
    '  if (name === "back") {',
    chartBlock,
    "Ícone chart"
  );
}

write(files.icon, icon);

/* =====================================================
   VALIDAÇÃO
===================================================== */

const finalApp = read(files.app);
const finalShell = read(files.shell);
const finalIcon = read(files.icon);
const finalPage = read(files.page);

const checks = [
  [finalApp, 'const Statistics = lazy', "Importação de Statistics"],
  [finalApp, 'STATISTICS: "statistics"', "ROUTES.STATISTICS no App"],
  [finalApp, 'return "/statistics";', "screenToPath"],
  [finalApp, 'p === "/statistics"', "pathToScreen"],
  [finalApp, 'return <Statistics />;', "renderScreen"],
  [finalShell, 'STATISTICS: "statistics"', "ROUTES.STATISTICS no AppShell"],
  [finalShell, 'key: ROUTES.STATISTICS', "Menu Estatísticas"],
  [finalShell, 'title: "Estatísticas"', "Título Estatísticas"],
  [finalIcon, 'name === "chart"', "Ícone chart"],
  [finalPage, 'export default function Statistics', "Componente Statistics"],
];

for (const [content, token, label] of checks) {
  if (!content.includes(token)) {
    throw new Error(`Validação estrutural falhou: ${label}`);
  }

  console.log(`OK — ${label}`);
}

const uniqueChecks = [
  [finalApp, 'STATISTICS: "statistics"', "ROUTES.STATISTICS no App"],
  [finalApp, 'p === "/statistics"', "pathToScreen"],
  [finalApp, 'return <Statistics />;', "renderScreen"],
  [finalShell, 'STATISTICS: "statistics"', "ROUTES.STATISTICS no AppShell"],
  [finalShell, 'key: ROUTES.STATISTICS', "Menu Estatísticas"],
  [finalIcon, 'name === "chart"', "Ícone chart"],
];

for (const [content, token, label] of uniqueChecks) {
  const count = countOccurrences(content, token);

  if (count !== 1) {
    throw new Error(
      `${label}: encontrado ${count} vez(es); esperado 1.`
    );
  }
}

console.log("Estrutura validada sem duplicações.");
