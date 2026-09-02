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

test("Admin operacional usa ciclo simples de usuario", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "Usuários cadastrados",
    "EDITAR",
    "SALVAR DADOS",
    "DIAS",
    "LIBERAR",
    "RENOVAR",
    "REATIVAR",
    "SUSPENDER",
    "EXCLUIR",
  ].forEach(
    (marker) => {
      expect(source)
        .toContain(marker);
    }
  );

  expect(source)
    .not
    .toContain(
      "REVOGAR ACESSO"
    );
});

test("autoridade de acesso permanece no backend", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "listUsers",
    "getUserAccess",
    "activateUserAccess",
    "revokeUserAccess",
    "deleteUserAccount",
    "createAdminOperationId",
    "updateAdminUserProfile",
    "Fonte de verdade: backend de acesso",
  ].forEach(
    (marker) => {
      expect(source)
        .toContain(marker);
    }
  );

  expect(source)
    .toContain(
      "readOnly"
    );
});

test("Admin principal nao volta a ter dashboard tecnico", () => {
  const source =
    read(
      "src/pages/Admin/Admin.jsx"
    );

  expect(source)
    .toContain(
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
    (marker) => {
      expect(source)
        .not
        .toContain(marker);
    }
  );
});
