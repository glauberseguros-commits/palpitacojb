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

test("pagamento usa contrato autoritativo", () => {
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
    .not.toContain(
      "Trial"
    );
});

test("admin nao grava assinatura em users", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/userManagement.api.js"
    );

  expect(source)
    .not.toContain(
      "updateDoc"
    );

  expect(source)
    .not.toContain(
      "serverTimestamp"
    );

  expect(source)
    .toContain(
      "activateAdminUserAccess"
    );

  expect(source)
    .toContain(
      "revokeAdminUserAccess"
    );
});

test("admin nao usa planos legados ou vitalicio", () => {
  const source =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  expect(source)
    .not.toContain(
      "ADMIN_USER_PLAN_OPTIONS"
    );

  expect(source)
    .not.toContain(
      "planStartAt"
    );

  expect(source)
    .not.toContain(
      "planEndAt"
    );

  expect(source)
    .not.toContain(
      "isLifetime"
    );

  expect(source)
    .not.toContain(
      ">Trial<"
    );

  expect(source)
    .toContain(
      "ATIVAR / RENOVAR +30 DIAS"
    );

  expect(source)
    .toContain(
      "REVOGAR ACESSO"
    );
});

test("backend oferece consulta admin e PIX por ambiente", () => {
  const source =
    read(
      "backend/routes/access.js"
    );

  expect(source)
    .toContain(
      '"/admin/user/:uid"'
    );

  expect(source)
    .toContain(
      "PALPITACO_PIX_KEY"
    );

  expect(source)
    .toContain(
      "PALPITACO_PIX_RECEIVER"
    );
});

test("accessClient usa endpoints administrativos", () => {
  const source =
    read(
      "src/services/accessClient.js"
    );

  expect(source)
    .toContain(
      "getAdminUserAccess"
    );

  expect(source)
    .toContain(
      "activateAdminUserAccess"
    );

  expect(source)
    .toContain(
      "revokeAdminUserAccess"
    );

  expect(source)
    .toContain(
      '"/api/access/admin/activate"'
    );

  expect(source)
    .toContain(
      '"/api/access/admin/revoke"'
    );
});
