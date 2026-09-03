import React, { useState } from "react";

const LOGO_SRC =
  "/logo/palpitaco-jb.png";

const SUPPORT_DISPLAY =
  "+55 (61) 9 9987-8710";

const SUPPORT_WHATSAPP =
  "https://wa.me/5561999878710";

const SUPPORT_EMAIL =
  "contato@palpitacojb.com.br";

function onlyDigits(value) {
  return String(value || "")
    .replace(/\D+/g, "")
    .slice(0, 11);
}

function formatPhone(value) {
  const digits =
    onlyDigits(value);

  if (!digits) return "";

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  const ddd =
    digits.slice(0, 2);

  if (digits.length <= 10) {
    const first =
      digits.slice(2, 6);

    const second =
      digits.slice(6, 10);

    return second
      ? `(${ddd}) ${first}-${second}`
      : `(${ddd}) ${first}`;
  }

  const first =
    digits.slice(2, 7);

  const second =
    digits.slice(7, 11);

  return second
    ? `(${ddd}) ${first}-${second}`
    : `(${ddd}) ${first}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(value || "")
      .trim()
      .toLowerCase()
  );
}

export default function LoginVisual({
  onEnter,
  onRegister,
  onResetPassword,
}) {
  const [mode, setMode] =
    useState("login");

  const [loginEmail, setLoginEmail] =
    useState("");

  const [loginPassword, setLoginPassword] =
    useState("");

  const [
    showLoginPassword,
    setShowLoginPassword,
  ] =
    useState(false);

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [
    showRegisterPassword,
    setShowRegisterPassword,
  ] =
    useState(false);

  const [
    showConfirmPassword,
    setShowConfirmPassword,
  ] =
    useState(false);

  const [
    acceptedTerms,
    setAcceptedTerms,
  ] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [notice, setNotice] =
    useState("");

  const [logoOk, setLogoOk] =
    useState(true);

  const ui = {
    page: {
      width: "100%",
      minHeight: "100vh",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "safe center",
      justifyContent: "center",
      padding:
        mode === "register"
          ? 8
          : 18,
      background: "#030303",
      color: "#fff",
    },

    card: {
      width: "100%",
      maxWidth: 430,
      boxSizing: "border-box",
      borderRadius: 22,
      overflow: "hidden",
      border:
        "1px solid rgba(202,166,75,0.34)",
      background:
        "linear-gradient(180deg, rgba(17,14,7,0.98), rgba(3,3,3,0.99))",
      boxShadow:
        "0 26px 80px rgba(0,0,0,0.60)",
    },

    brand: {
      padding:
        mode === "register"
          ? "10px 18px 8px"
          : "26px 22px 22px",
      textAlign: "center",
      borderBottom:
        "1px solid rgba(202,166,75,0.16)",
    },

    logo: {
      width:
        mode === "register"
          ? 78
          : 124,
      height:
        mode === "register"
          ? 78
          : 124,
      objectFit: "contain",
      margin:
        mode === "register"
          ? "0 auto 3px"
          : "0 auto 8px",
      display: "block",
    },

    title: {
      fontSize:
        mode === "register"
          ? 22
          : 25,
      fontWeight: 950,
      letterSpacing: 0.5,
    },

    subtitle: {
      marginTop:
        mode === "register"
          ? 3
          : 7,
      fontSize:
        mode === "register"
          ? 11
          : 12.5,
      fontWeight: 700,
      opacity: 0.72,
    },

    body: {
      padding:
        mode === "register"
          ? 10
          : 18,
    },

    tabs: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap:
        mode === "register"
          ? 4
          : 7,
      padding:
        mode === "register"
          ? 3
          : 5,
      borderRadius: 13,
      background:
        "rgba(255,255,255,0.04)",
    },

    tab: (active) => ({
      minHeight:
        mode === "register"
          ? 34
          : 42,
      borderRadius: 9,
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12.5,
      color:
        active
          ? "#e3c56b"
          : "rgba(255,255,255,0.64)",
      background:
        active
          ? "rgba(202,166,75,0.13)"
          : "transparent",
      border:
        active
          ? "1px solid rgba(202,166,75,0.40)"
          : "1px solid transparent",
    }),

    form: {
      display: "grid",
      gap:
        mode === "register"
          ? 6
          : 13,
      marginTop:
        mode === "register"
          ? 8
          : 18,
    },

    field: {
      display: "grid",
      gap:
        mode === "register"
          ? 3
          : 6,
    },

    label: {
      fontSize:
        mode === "register"
          ? 11.5
          : 12,
      fontWeight: 850,
      color:
        "rgba(255,255,255,0.88)",
    },

    input: {
      width: "100%",
      height:
        mode === "register"
          ? 38
          : 46,
      boxSizing: "border-box",
      padding: "0 13px",
      borderRadius: 12,
      outline: "none",
      color: "#fff",
      background:
        "rgba(255,255,255,0.045)",
      border:
        "1px solid rgba(255,255,255,0.14)",
    },

    passwordWrap: {
      position: "relative",
    },

    passwordInput: {
      width: "100%",
      height:
        mode === "register"
          ? 38
          : 46,
      boxSizing: "border-box",
      padding: "0 82px 0 13px",
      borderRadius: 12,
      outline: "none",
      color: "#fff",
      background:
        "rgba(255,255,255,0.045)",
      border:
        "1px solid rgba(255,255,255,0.14)",
    },

    showButton: {
      position: "absolute",
      top: 0,
      right: 4,
      height:
        mode === "register"
          ? 38
          : 46,
      padding: "0 10px",
      border: 0,
      color: "#d8b950",
      background: "transparent",
      fontSize: 11,
      fontWeight: 900,
      cursor: "pointer",
    },

    primary: {
      minHeight:
        mode === "register"
          ? 40
          : 48,
      marginTop:
        mode === "register"
          ? 1
          : 4,
      borderRadius: 13,
      border:
        "1px solid rgba(218,184,72,0.60)",
      background:
        "linear-gradient(180deg, rgba(94,71,17,0.88), rgba(40,31,10,0.94))",
      color: "#fff",
      cursor: "pointer",
      fontWeight: 950,
      fontSize: 13,
    },

    textButton: {
      display: "block",
      margin: "12px auto 0",
      padding: 0,
      border: 0,
      background: "transparent",
      color: "rgba(255,255,255,0.72)",
      textDecoration: "underline",
      cursor: "pointer",
      fontSize: 12,
    },

    acceptance: {
      display: "grid",
      gridTemplateColumns: "18px 1fr",
      gap:
        mode === "register"
          ? 6
          : 9,
      alignItems: "start",
      fontSize:
        mode === "register"
          ? 10.5
          : 11.5,
      lineHeight:
        mode === "register"
          ? 1.3
          : 1.5,
      color: "rgba(255,255,255,0.72)",
    },

    legalLink: {
      color: "#d7b84c",
      textDecoration: "underline",
      fontWeight: 800,
    },

    error: {
      marginTop:
        mode === "register"
          ? 7
          : 14,
      padding:
        mode === "register"
          ? 8
          : 11,
      borderRadius: 11,
      color: "#ffb1b1",
      fontSize:
        mode === "register"
          ? 11.5
          : 12.5,
      lineHeight:
        mode === "register"
          ? 1.3
          : 1.4,
      border:
        "1px solid rgba(255,100,100,0.25)",
      background:
        "rgba(255,70,70,0.08)",
    },

    notice: {
      marginTop:
        mode === "register"
          ? 7
          : 14,
      padding:
        mode === "register"
          ? 8
          : 11,
      borderRadius: 11,
      color: "#cdebd6",
      fontSize:
        mode === "register"
          ? 11.5
          : 12.5,
      lineHeight:
        mode === "register"
          ? 1.3
          : 1.4,
      border:
        "1px solid rgba(80,190,120,0.24)",
      background:
        "rgba(70,180,110,0.08)",
    },

    footer: {
      marginTop:
        mode === "register"
          ? 8
          : 20,
      paddingTop:
        mode === "register"
          ? 6
          : 16,
      borderTop:
        "1px solid rgba(255,255,255,0.08)",
      textAlign: "center",
      fontSize:
        mode === "register"
          ? 10
          : 11.5,
      lineHeight:
        mode === "register"
          ? 1.35
          : 1.7,
      color: "rgba(255,255,255,0.60)",
    },
  };

  function switchMode(nextMode) {
    if (busy) return;

    setMode(nextMode);
    setError("");
    setNotice("");
  }

  async function submitLogin(event) {
    event.preventDefault();

    if (busy) return;

    const safeEmail =
      String(loginEmail || "")
        .trim()
        .toLowerCase();

    if (!validEmail(safeEmail)) {
      setError(
        "Informe um e-mail válido."
      );
      return;
    }

    if (!loginPassword) {
      setError(
        "Informe sua senha."
      );
      return;
    }

    if (
      typeof onEnter !==
      "function"
    ) {
      setError(
        "Login indisponível."
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await onEnter({
        mode: "firebase",
        login: safeEmail,
        password: loginPassword,
      });
    }
    catch (err) {
      setError(
        String(
          err?.message || ""
        ).trim() ||
        "Não foi possível entrar."
      );
    }
    finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (busy) return;

    const safeEmail =
      String(loginEmail || "")
        .trim()
        .toLowerCase();

    if (!validEmail(safeEmail)) {
      setError(
        "Digite seu e-mail acima para recuperar a senha."
      );
      return;
    }

    if (
      typeof onResetPassword !==
      "function"
    ) {
      setError(
        "Recuperação de senha indisponível."
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await onResetPassword(
        safeEmail
      );

      setNotice(
        "Enviamos as instruções de recuperação para o e-mail informado."
      );
    }
    catch (err) {
      setError(
        String(
          err?.message || ""
        ).trim() ||
        "Não foi possível enviar a recuperação de senha."
      );
    }
    finally {
      setBusy(false);
    }
  }

  async function submitRegister(event) {
    event.preventDefault();

    if (busy) return;

    const safeName =
      String(name || "").trim();

    const safePhone =
      onlyDigits(phone);

    const safeEmail =
      String(email || "")
        .trim()
        .toLowerCase();

    if (safeName.length < 2) {
      setError(
        "Informe seu nome."
      );
      return;
    }

    if (
      safePhone.length !== 10 &&
      safePhone.length !== 11
    ) {
      setError(
        "Informe um telefone válido."
      );
      return;
    }

    if (!validEmail(safeEmail)) {
      setError(
        "Informe um e-mail válido."
      );
      return;
    }

    if (
      String(password).length < 6
    ) {
      setError(
        "A senha precisa ter pelo menos 6 caracteres."
      );
      return;
    }

    if (
      password !==
      confirmPassword
    ) {
      setError(
        "As senhas não coincidem."
      );
      return;
    }

    if (!acceptedTerms) {
      setError(
        "Para criar a conta, aceite os Termos de Uso e a Política de Privacidade."
      );
      return;
    }

    if (
      typeof onRegister !==
      "function"
    ) {
      setError(
        "Cadastro indisponível."
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      await onRegister({
        name: safeName,
        phone: safePhone,
        email: safeEmail,
        password,
        confirmPassword,
        acceptedTerms: true,
        legalVersion:
          "2026-09-02",
      });
    }
    catch (err) {
      setError(
        String(
          err?.message || ""
        ).trim() ||
        "Não foi possível criar sua conta."
      );
    }
    finally {
      setBusy(false);
    }
  }

  return (
    <div className="standalone-access-scroll standalone-access-scroll--login" style={ui.page}>
      <div style={ui.card}>
        <div style={ui.brand}>
          {logoOk ? (
            <img
              src={LOGO_SRC}
              alt="PalPitaco JB"
              style={ui.logo}
              onError={() =>
                setLogoOk(false)
              }
            />
          ) : null}

          <div style={ui.title}>
            PALPITACO JB
          </div>

          <div style={ui.subtitle}>
            Estatística • Leitura • Análise
          </div>
        </div>

        <div style={ui.body}>
          <div style={ui.tabs}>
            <button
              type="button"
              style={
                ui.tab(
                  mode === "login"
                )
              }
              onClick={() =>
                switchMode("login")
              }
              disabled={busy}
            >
              ENTRAR
            </button>

            <button
              type="button"
              style={
                ui.tab(
                  mode === "register"
                )
              }
              onClick={() =>
                switchMode(
                  "register"
                )
              }
              disabled={busy}
            >
              CRIAR CONTA
            </button>
          </div>

          {error ? (
            <div
              style={ui.error}
              role="alert"
            >
              {error}
            </div>
          ) : null}

          {notice ? (
            <div
              style={ui.notice}
              role="status"
            >
              {notice}
            </div>
          ) : null}

          {mode === "login" ? (
            <>
              <form
                style={ui.form}
                onSubmit={submitLogin}
              >
                <label style={ui.field}>
                  <span style={ui.label}>
                    E-mail
                  </span>

                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) =>
                      setLoginEmail(
                        e.target.value
                      )
                    }
                    placeholder="Digite seu e-mail"
                    autoComplete="email"
                    disabled={busy}
                    style={ui.input}
                  />
                </label>

                <label style={ui.field}>
                  <span style={ui.label}>
                    Senha
                  </span>

                  <div style={ui.passwordWrap}>
                    <input
                      type={
                        showLoginPassword
                          ? "text"
                          : "password"
                      }
                      value={loginPassword}
                      onChange={(e) =>
                        setLoginPassword(
                          e.target.value
                        )
                      }
                      placeholder="Digite sua senha"
                      autoComplete="current-password"
                      disabled={busy}
                      style={ui.passwordInput}
                    />

                    <button
                      type="button"
                      style={ui.showButton}
                      onClick={() =>
                        setShowLoginPassword(
                          (value) =>
                            !value
                        )
                      }
                      disabled={busy}
                    >
                      {showLoginPassword
                        ? "OCULTAR"
                        : "MOSTRAR"}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={busy}
                  style={ui.primary}
                >
                  {busy
                    ? "ENTRANDO..."
                    : "ENTRAR"}
                </button>
              </form>

              <button
                type="button"
                style={ui.textButton}
                onClick={resetPassword}
                disabled={busy}
              >
                Esqueci minha senha
              </button>
            </>
          ) : (
            <form
              style={ui.form}
              onSubmit={submitRegister}
            >
              <label style={ui.field}>
                <span style={ui.label}>
                  Nome
                </span>

                <input
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value
                    )
                  }
                  placeholder="Digite seu nome"
                  autoComplete="name"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  Telefone
                </span>

                <input
                  type="tel"
                  value={
                    formatPhone(
                      phone
                    )
                  }
                  onChange={(e) =>
                    setPhone(
                      onlyDigits(
                        e.target.value
                      )
                    )
                  }
                  placeholder="(61) 99999-9999"
                  autoComplete="tel"
                  inputMode="numeric"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  E-mail
                </span>

                <input
                  type="email"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                  placeholder="Digite seu e-mail"
                  autoComplete="email"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  Senha
                </span>

                <div style={ui.passwordWrap}>
                  <input
                    type={
                      showRegisterPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    placeholder="Mínimo de 6 caracteres"
                    autoComplete="new-password"
                    disabled={busy}
                    style={ui.passwordInput}
                  />

                  <button
                    type="button"
                    style={ui.showButton}
                    onClick={() =>
                      setShowRegisterPassword(
                        (value) =>
                          !value
                      )
                    }
                    disabled={busy}
                  >
                    {showRegisterPassword
                      ? "OCULTAR"
                      : "MOSTRAR"}
                  </button>
                </div>
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  Confirmar senha
                </span>

                <div style={ui.passwordWrap}>
                  <input
                    type={
                      showConfirmPassword
                        ? "text"
                        : "password"
                    }
                    value={confirmPassword}
                    onChange={(e) =>
                      setConfirmPassword(
                        e.target.value
                      )
                    }
                    placeholder="Digite a senha novamente"
                    autoComplete="new-password"
                    disabled={busy}
                    style={ui.passwordInput}
                  />

                  <button
                    type="button"
                    style={ui.showButton}
                    onClick={() =>
                      setShowConfirmPassword(
                        (value) =>
                          !value
                      )
                    }
                    disabled={busy}
                  >
                    {showConfirmPassword
                      ? "OCULTAR"
                      : "MOSTRAR"}
                  </button>
                </div>
              </label>

              <label style={ui.acceptance}>
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) =>
                    setAcceptedTerms(
                      event.target.checked
                    )
                  }
                  disabled={busy}
                />

                <span>
                  Li e aceito os{" "}
                  <a
                    href="/termos"
                    target="_blank"
                    rel="noreferrer"
                    style={ui.legalLink}
                  >
                    Termos de Uso
                  </a>
                  {" "}e declaro ciência da{" "}
                  <a
                    href="/privacidade"
                    target="_blank"
                    rel="noreferrer"
                    style={ui.legalLink}
                  >
                    Política de Privacidade
                  </a>
                  .
                </span>
              </label>

              <button
                type="submit"
                disabled={
                  busy ||
                  !acceptedTerms
                }
                style={ui.primary}
              >
                {busy
                  ? "CADASTRANDO..."
                  : "CADASTRAR"}
              </button>
            </form>
          )}

          <div style={ui.footer}>
            <div>
              Precisa de ajuda?
            </div>

            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noreferrer"
              style={ui.legalLink}
            >
              WhatsApp: {SUPPORT_DISPLAY}
            </a>

            <div>
              <a
                href={"mailto:" + SUPPORT_EMAIL}
                style={ui.legalLink}
              >
                {SUPPORT_EMAIL}
              </a>
            </div>

            <div
              style={{
                marginTop: 8,
              }}
            >
              <a
                href="/termos"
                target="_blank"
                rel="noreferrer"
                style={ui.legalLink}
              >
                Termos de Uso
              </a>

              {" · "}

              <a
                href="/privacidade"
                target="_blank"
                rel="noreferrer"
                style={ui.legalLink}
              >
                Política de Privacidade
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}