import fs from "fs";
import path from "path";

function read(relative) {
  return fs.readFileSync(
    path.resolve(
      process.cwd(),
      relative
    ),
    "utf8"
  );
}

test("Admin principal mostra somente usuarios", () => {
  const source =
    read(
      "src/pages/Admin/Admin.jsx"
    );

  expect(source).toContain(
    "Gestão de usuários"
  );

  expect(source).toContain(
    "<UserManagementPage"
  );

  [
    "Dashboard Técnico",
    "Motor de Milhares",
    "Auditorias",
    "Backtests",
    "Logs",
    "Configurações",
  ].forEach(
    (value) => {
      expect(source)
        .not
        .toContain(value);
    }
  );
});

test("login Admin nao fala mais em Engine Center", () => {
  const source =
    read(
      "src/pages/Admin/AdminLogin.jsx"
    );

  expect(source)
    .not
    .toContain(
      "Engine Center"
    );

  expect(source).toContain(
    "Gestão de usuários"
  );
});

test("gestao usa autoridade existente de acesso", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "listUsers",
    "getUserAccess",
    "createAdminOperationId",
    "activateUserAccess",
    "revokeUserAccess",
    "ATIVAR / RENOVAR +30 DIAS",
    "REVOGAR ACESSO",
    "Fonte de verdade: backend de acesso",
  ].forEach(
    (value) => {
      expect(source)
        .toContain(value);
    }
  );
});

test("nome e telefone sao editaveis", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/userProfileAdmin.api.js"
    );

  expect(source).toContain(
    "updateDoc"
  );

  expect(source).toContain(
    "name:"
  );

  expect(source).toContain(
    "phone:"
  );

  expect(source).toContain(
    "phoneDigits"
  );
});

test("email nao e editado pelo painel", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  expect(source).toContain(
    "readOnly"
  );
});