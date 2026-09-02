import fs from "fs";
import path from "path";

function app() {
  return fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/App.jsx"
    ),
    "utf8"
  );
}

test("/admin utiliza o Admin existente", () => {
  const source = app();

  expect(source).toContain(
    'const ADMIN_PATH = "/admin";'
  );

  expect(source).toContain(
    "function isAdminRouteNow("
  );

  expect(source).toContain(
    "path === ADMIN_PATH"
  );

  expect(source).toContain(
    "<AdminLogin"
  );

  expect(source).toContain(
    "<Admin"
  );

  expect(source).toContain(
    "isUidAdmin(user.uid)"
  );
});

test("rotas existentes permanecem presentes", () => {
  const source = app();

  expect(source).toContain(
    "<LegalPage"
  );

  expect(source).toContain(
    '"/termos"'
  );

  expect(source).toContain(
    '"/privacidade"'
  );

  expect(source).toContain(
    "<Payments"
  );

  expect(source).toContain(
    "<AppShell"
  );
});

test("fluxo comum continua ignorado em modo admin", () => {
  const source = app();

  expect(source).toContain(
    "if (adminMode) return;"
  );
});