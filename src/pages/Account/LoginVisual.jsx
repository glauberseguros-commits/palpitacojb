import React, { useState } from "react";

const LOGO_SRC =
  "/logo/palpitaco-jb.png";

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
}) {
  const [mode, setMode] =
    useState("login");

  const [
    loginEmail,
    setLoginEmail,
  ] =
    useState("");

  const [
    loginPassword,
    setLoginPassword,
  ] =
    useState("");

  const [name, setName] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    confirmPassword,
    setConfirmPassword,
  ] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState("");

  const [logoOk, setLogoOk] =
    useState(true);

  const ui = {
    page: {
      width: "100%",
      minHeight: "100%",
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 18,
      color: "#fff",
    },

    card: {
      width: "100%",
      maxWidth: 430,
      boxSizing: "border-box",
      borderRadius: 22,
      overflow: "hidden",
      border:
        "1px solid rgba(202,166,75,0.28)",
      background:
        "linear-gradient(180deg, rgba(17,14,7,0.98), rgba(3,3,3,0.99))",
      boxShadow:
        "0 26px 80px rgba(0,0,0,0.60)",
    },

    brand: {
      padding: "28px 22px 24px",
      textAlign: "center",
      borderBottom:
        "1px solid rgba(202,166,75,0.16)",
    },

    logo: {
      width: 112,
      height: 112,
      objectFit: "contain",
      margin: "0 auto 10px",
      display: "block",
    },

    title: {
      fontSize: 24,
      fontWeight: 950,
      letterSpacing: 0.5,
    },

    subtitle: {
      marginTop: 8,
      fontSize: 12.5,
      fontWeight: 700,
      opacity: 0.72,
    },

    body: {
      padding: 18,
    },

    tabs: {
      display: "grid",
      gridTemplateColumns:
        "1fr 1fr",
      gap: 7,
      padding: 5,
      borderRadius: 13,
      background:
        "rgba(255,255,255,0.04)",
    },

    tab: (active) => ({
      minHeight: 42,
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
      gap: 13,
      marginTop: 18,
    },

    field: {
      display: "grid",
      gap: 6,
    },

    label: {
      fontSize: 12,
      fontWeight: 850,
      color:
        "rgba(255,255,255,0.88)",
    },

    input: {
      width: "100%",
      height: 46,
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

    primary: {
      minHeight: 48,
      marginTop: 4,
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

    error: {
      marginTop: 14,
      padding: 11,
      borderRadius: 11,
      color: "#ffb1b1",
      fontSize: 12.5,
      lineHeight: 1.4,
      border:
        "1px solid rgba(255,100,100,0.25)",
      background:
        "rgba(255,70,70,0.08)",
    },
  };

  function switchMode(nextMode) {
    if (busy) return;

    setMode(nextMode);
    setError("");
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

    try {
      await onEnter({
        mode: "firebase",
        login: safeEmail,
        password:
          loginPassword,
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

  async function submitRegister(
    event
  ) {
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

    try {
      await onRegister({
        name:
          safeName,

        phone:
          safePhone,

        email:
          safeEmail,

        password,

        confirmPassword,
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
    <div style={ui.page}>
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
            Resultados • Estatística • Insights
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
            <div style={ui.error}>
              {error}
            </div>
          ) : null}

          {mode === "login" ? (
            <form
              style={ui.form}
              onSubmit={
                submitLogin
              }
            >
              <label style={ui.field}>
                <span style={ui.label}>
                  E-mail
                </span>

                <input
                  type="email"
                  value={
                    loginEmail
                  }
                  onChange={(e) =>
                    setLoginEmail(
                      e.target.value
                    )
                  }
                  placeholder=
                    "Digite seu e-mail"
                  autoComplete="email"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  Senha
                </span>

                <input
                  type="password"
                  value={
                    loginPassword
                  }
                  onChange={(e) =>
                    setLoginPassword(
                      e.target.value
                    )
                  }
                  placeholder=
                    "Digite sua senha"
                  autoComplete=
                    "current-password"
                  disabled={busy}
                  style={ui.input}
                />
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
          ) : (
            <form
              style={ui.form}
              onSubmit={
                submitRegister
              }
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
                  placeholder=
                    "Digite seu nome"
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
                  placeholder=
                    "(61) 99999-9999"
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
                  placeholder=
                    "Digite seu e-mail"
                  autoComplete="email"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  Senha
                </span>

                <input
                  type="password"
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                  placeholder=
                    "Mínimo de 6 caracteres"
                  autoComplete=
                    "new-password"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <label style={ui.field}>
                <span style={ui.label}>
                  Confirmar senha
                </span>

                <input
                  type="password"
                  value={
                    confirmPassword
                  }
                  onChange={(e) =>
                    setConfirmPassword(
                      e.target.value
                    )
                  }
                  placeholder=
                    "Digite a senha novamente"
                  autoComplete=
                    "new-password"
                  disabled={busy}
                  style={ui.input}
                />
              </label>

              <button
                type="submit"
                disabled={busy}
                style={ui.primary}
              >
                {busy
                  ? "CADASTRANDO..."
                  : "CADASTRAR"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
