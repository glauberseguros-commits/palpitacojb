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

test("Admin e uma pagina simples de cadastro e controle", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "Usuários cadastrados",
    "TOTAL",
    "ATIVOS",
    "PENDENTES",
    "SUSPENSOS",
    "EXPIRADOS",
    "BUSCAR",
    "SITUAÇÃO",
    "EDITAR",
    "SALVAR DADOS",
    "ATIVAR / RENOVAR +30 DIAS",
    "REVOGAR ACESSO",
  ].forEach(
    (marker) => {
      expect(source)
        .toContain(marker);
    }
  );
});

test("nao existe painel lateral ou dashboard tecnico", () => {
  const source =
    read(
      "src/pages/Admin/Admin.jsx"
    );

  [
    "Engine Center",
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

test("autoridade existente permanece", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "listUsers",
    "getUserAccess",
    "activateUserAccess",
    "revokeUserAccess",
    "createAdminOperationId",
    "updateAdminUserProfile",
    "Fonte de verdade: backend de acesso",
  ].forEach(
    (marker) => {
      expect(source)
        .toContain(marker);
    }
  );
});

test("email continua somente leitura", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  expect(source).toContain(
    "readOnly"
  );
});