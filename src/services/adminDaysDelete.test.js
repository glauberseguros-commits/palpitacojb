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


test("consulta Admin tolera cadastro sem e-mail", () => {
  const route =
    read(
      "backend/routes/access.js"
    );

  const inspectStart =
    route.indexOf(
      '"/admin/user/:uid"'
    );

  const activateStart =
    route.indexOf(
      '"/admin/activate"'
    );

  const revokeStart =
    route.indexOf(
      '"/admin/revoke"'
    );

  const deleteStart =
    route.indexOf(
      '"/admin/delete"'
    );

  expect(inspectStart)
    .toBeGreaterThanOrEqual(0);

  expect(activateStart)
    .toBeGreaterThan(inspectStart);

  expect(revokeStart)
    .toBeGreaterThan(activateStart);

  expect(deleteStart)
    .toBeGreaterThan(revokeStart);

  const inspectBlock =
    route.slice(
      inspectStart,
      activateStart
    );

  const activateBlock =
    route.slice(
      activateStart,
      revokeStart
    );

  const revokeBlock =
    route.slice(
      revokeStart,
      deleteStart
    );

  expect(route)
    .toContain(
      "function requireTargetCanActivate"
    );

  expect(inspectBlock)
    .not
    .toContain(
      "requireTargetCanActivate"
    );

  expect(activateBlock)
    .toContain(
      "requireTargetCanActivate"
    );

  expect(revokeBlock)
    .not
    .toContain(
      "requireTargetCanActivate"
    );
});


test("Admin traduz codigos internos para mensagens operacionais", () => {
  const page =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  [
    "adminErrorMessage",
    "TARGET_USER_EMAIL_REQUIRED",
    "TARGET_USER_NOT_FOUND",
    "TARGET_USER_DISABLED",
    "Este cadastro não possui e-mail.",
    "A conta de login deste cadastro não foi encontrada.",
  ].forEach(
    (marker) => {
      expect(page)
        .toContain(marker);
    }
  );
});
