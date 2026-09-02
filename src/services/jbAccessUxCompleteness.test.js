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

test("login JB oferece senha recuperacao legal e suporte", () => {
  const source =
    read(
      "src/pages/Account/LoginVisual.jsx"
    );

  expect(source).toContain(
    "Esqueci minha senha"
  );

  expect(source).toContain(
    "MOSTRAR"
  );

  expect(source).toContain(
    'href="/termos"'
  );

  expect(source).toContain(
    'href="/privacidade"'
  );

  expect(source).toContain(
    "acceptedTerms"
  );

  expect(source).toContain(
    "contato@palpitacojb.com.br"
  );
});

test("recuperacao usa Firebase Auth do JB", () => {
  const source =
    read(
      "src/pages/Account/Account.jsx"
    );

  expect(source).toContain(
    "sendPasswordResetEmail"
  );

  expect(source).toContain(
    "onResetPassword"
  );
});

test("pagamento JB possui PIX completo", () => {
  const source =
    read(
      "src/pages/Payments/Payments.jsx"
    );

  expect(source).toContain(
    "+5561999878710"
  );

  expect(source).toContain(
    "QRCode"
  );

  expect(source).toContain(
    "buildStaticPixPayload"
  );

  expect(source).toContain(
    "COPIAR CHAVE PIX"
  );

  expect(source).toContain(
    "PIX COPIA E COLA"
  );

  expect(source).toContain(
    "COPIAR PIX COPIA E COLA"
  );

  expect(source).toContain(
    "ENVIAR COMPROVANTE"
  );

  expect(source).toContain(
    "Aguardando liberação"
  );

  expect(source).toContain(
    "contato@palpitacojb.com.br"
  );
});

test("backend JB publica PIX e canais oficiais", () => {
  const source =
    read(
      "backend/routes/access.js"
    );

  expect(source).toContain(
    "+5561999878710"
  );

  expect(source).toContain(
    "supportPhone"
  );

  expect(source).toContain(
    "supportEmail"
  );

  expect(source).toContain(
    "contato@palpitacojb.com.br"
  );
});

test("rotas legais sao publicas", () => {
  const source =
    read(
      "src/App.jsx"
    );

  expect(source).toContain(
    '"/termos"'
  );

  expect(source).toContain(
    '"/privacidade"'
  );

  expect(source).toContain(
    "<LegalPage"
  );

  expect(source).toContain(
    "<Payments"
  );
});

test("implementacao permanece exclusiva do JB", () => {
  const targets = [
    "src/App.jsx",
    "src/pages/Account/Account.jsx",
    "src/pages/Account/LoginVisual.jsx",
    "src/pages/Payments/Payments.jsx",
    "src/pages/Legal/LegalPage.jsx",
    "backend/routes/access.js",
    "src/services/pixBrCode.js",
  ];

  for (
    const relative of targets
  ) {
    const source =
      read(relative);

    expect(source)
      .not
      .toMatch(
        /MAROCA|palpitesdamaroca/i
      );
  }
});