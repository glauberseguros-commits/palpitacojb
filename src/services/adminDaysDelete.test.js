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

test("Admin permite dias customizados sem mudar contrato publico", () => {
  const page =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  const client =
    read(
      "src/services/accessClient.js"
    );

  const service =
    read(
      "backend/access/accessService.js"
    );

  expect(page)
    .toContain(
      'type="number"'
    );

  expect(page)
    .toContain(
      "DIAS"
    );

  expect(client)
    .toContain(
      "days:"
    );

  expect(service)
    .toContain(
      "normalizeSubscriptionDays"
    );

  expect(service)
    .toContain(
      "days > 3650"
    );
});

test("exclusao definitiva e protegida no backend", () => {
  const route =
    read(
      "backend/routes/access.js"
    );

  [
    '"/admin/delete"',
    "requireFirebaseUser",
    "requireAdminUser",
    "ADMIN_SELF_DELETE_FORBIDDEN",
    "deleteDocumentTree",
    'collection("users")',
    'collection("admins")',
    "ACCESS_PRODUCT",
    ".deleteUser(uid)",
  ].forEach(
    (marker) => {
      expect(route)
        .toContain(marker);
    }
  );
});

test("revoke fica interno e nao aparece como acao do Admin", () => {
  const page =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  expect(page)
    .toContain(
      "revokeUserAccess"
    );

  expect(page)
    .not
    .toContain(
      "REVOGAR ACESSO"
    );
});
