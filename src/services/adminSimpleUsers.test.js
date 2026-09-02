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

test("Admin apresenta apenas gestao operacional de usuarios", () => {
  const admin =
    read(
      "src/pages/Admin/Admin.jsx"
    );

  const users =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  expect(admin)
    .toContain(
      "<UserManagementPage"
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
      expect(users)
        .toContain(marker);
    }
  );

  expect(users)
    .not
    .toContain(
      "REVOGAR ACESSO"
    );
});

test("suspensao usa autoridade tecnica existente sem expor o termo", () => {
  const users =
    read(
      "src/pages/Admin/modules/UserManagement/UserManagementPage.jsx"
    );

  expect(users)
    .toContain(
      "revokeUserAccess"
    );

  expect(users)
    .toContain(
      "Suspensão administrativa"
    );

  expect(users)
    .toContain(
      "Acesso suspenso."
    );
});
