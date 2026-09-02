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

test("pagamento continua no contrato autoritativo de 30 dias", () => {
  const source =
    read(
      "src/pages/Payments/Payments.jsx"
    );

  expect(source)
    .toContain(
      "getAccessProduct"
    );

  expect(source)
    .toContain(
      "getMyAccess"
    );

  expect(source)
    .toContain(
      "pixKey"
    );

  expect(source)
    .not
    .toContain(
      "Trial"
    );
});

test("admin usa backend para assinatura e exclusao", () => {
  const api =
    read(
      "src/pages/Admin/modules/UserManagement/userManagement.api.js"
    );

  [
    "activateAdminUserAccess",
    "revokeAdminUserAccess",
    "deleteAdminUserAccount",
  ].forEach(
    (marker) => {
      expect(api)
        .toContain(marker);
    }
  );

  expect(api)
    .not
    .toContain(
      "updateDoc"
    );

  expect(api)
    .not
    .toContain(
      "serverTimestamp"
    );
});

test("admin nao exibe planos legados nem revogar", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "ADMIN_USER_PLAN_OPTIONS",
    "planStartAt",
    "planEndAt",
    "isLifetime",
    ">Trial<",
    "REVOGAR ACESSO",
  ].forEach(
    (marker) => {
      expect(source)
        .not
        .toContain(marker);
    }
  );

  [
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
});

test("backend expoe rotas Admin protegidas", () => {
  const source =
    read(
      "backend/routes/access.js"
    );

  [
    '"/admin/user/:uid"',
    '"/admin/activate"',
    '"/admin/revoke"',
    '"/admin/delete"',
    "PALPITACO_PIX_KEY",
    "PALPITACO_PIX_RECEIVER",
  ].forEach(
    (marker) => {
      expect(source)
        .toContain(marker);
    }
  );
});

test("accessClient usa endpoints administrativos", () => {
  const source =
    read(
      "src/services/accessClient.js"
    );

  [
    "getAdminUserAccess",
    "activateAdminUserAccess",
    "revokeAdminUserAccess",
    "deleteAdminUserAccount",
    '"/api/access/admin/activate"',
    '"/api/access/admin/revoke"',
    '"/api/access/admin/delete"',
  ].forEach(
    (marker) => {
      expect(source)
        .toContain(marker);
    }
  );
});
