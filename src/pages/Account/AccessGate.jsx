import React, { useMemo, useState } from "react";

const LOGO_SRC = "/logo/palpitaco-jb.png";

export default function AccessGate({
  mode = "error",
  email = "",
  slot = "",
  busy = false,
  error = "",
  onConfirmCode = null,
  onRetry = null,
  onLogout = null,
}) {
  const [code, setCode] = useState("");

  const ui = useMemo(
    () => ({
      page: {
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "grid",
        placeItems: "center",
        padding: 20,
        background: "#050505",
        color: "rgba(255,255,255,0.94)",
        fontFamily:
          "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      },

      card: {
        width: "min(520px, 100%)",
        border: "1px solid rgba(202,166,75,0.22)",
        borderRadius: 24,
        background:
          "linear-gradient(180deg, rgba(202,166,75,0.08), rgba(0,0,0,0.76) 34%)",
        boxShadow: "0 28px 80px rgba(0,0,0,0.58)",
        padding: 24,
        boxSizing: "border-box",
      },

      logo: {
        display: "block",
        width: "min(230px, 68vw)",
        height: "auto",
        margin: "0 auto 10px",
      },

      title: {
        textAlign: "center",
        fontSize: 22,
        fontWeight: 950,
        margin: "8px 0",
      },

      text: {
        textAlign: "center",
        lineHeight: 1.5,
        color: "rgba(255,255,255,0.72)",
        fontSize: 14,
      },

      product: {
        margin: "18px 0",
        border: "1px solid rgba(202,166,75,0.22)",
        borderRadius: 18,
        padding: 16,
        textAlign: "center",
        background: "rgba(202,166,75,0.06)",
      },

      price: {
        fontSize: 27,
        fontWeight: 1000,
      },

      input: {
        width: "100%",
        boxSizing: "border-box",
        height: 54,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.16)",
        background: "rgba(255,255,255,0.05)",
        color: "#fff",
        outline: "none",
        textAlign: "center",
        fontSize: 22,
        fontWeight: 900,
        letterSpacing: 8,
        marginTop: 16,
      },

      error: {
        marginTop: 14,
        border: "1px solid rgba(255,110,110,0.28)",
        background: "rgba(255,110,110,0.08)",
        borderRadius: 14,
        padding: "11px 12px",
        color: "rgba(255,140,140,0.96)",
        textAlign: "center",
        fontSize: 13,
        fontWeight: 700,
      },

      actions: {
        display: "grid",
        gap: 10,
        marginTop: 18,
      },

      primary: {
        minHeight: 52,
        borderRadius: 16,
        border: "1px solid rgba(202,166,75,0.50)",
        background:
          "linear-gradient(180deg, rgba(202,166,75,0.24), rgba(202,166,75,0.10))",
        color: "#fff",
        fontWeight: 950,
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.58 : 1,
      },

      secondary: {
        minHeight: 48,
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.13)",
        background: "rgba(255,255,255,0.04)",
        color: "rgba(255,255,255,0.84)",
        fontWeight: 800,
        cursor: busy ? "not-allowed" : "pointer",
        opacity: busy ? 0.58 : 1,
      },
    }),
    [busy]
  );

  const cleanEmail = String(email || "").trim();
  const cleanSlot = String(slot || "").trim().toUpperCase();

  async function confirmCode() {
    if (
      busy ||
      typeof onConfirmCode !== "function"
    ) {
      return;
    }

    const digits =
      String(code || "")
        .replace(/\D/g, "")
        .slice(0, 6);

    await onConfirmCode(digits);
  }

  return (
    <div style={ui.page}>
      <div style={ui.card}>
        <img
          src={LOGO_SRC}
          alt="Palpitaco JB"
          style={ui.logo}
        />

        {mode === "subscription" ? (
          <>
            <div style={ui.title}>
              Assinatura necessária
            </div>

            <div style={ui.text}>
              Sua identidade foi confirmada, mas não há
              uma assinatura ativa para esta conta.
            </div>

            <div style={ui.product}>
              <div style={ui.price}>
                R$ 49,90
              </div>

              <div style={ui.text}>
                Acesso por 30 dias
              </div>

              <div
                style={{
                  ...ui.text,
                  marginTop: 5,
                }}
              >
                Pagamento via PIX
              </div>
            </div>

            {cleanEmail ? (
              <div style={ui.text}>
                Conta: {cleanEmail}
              </div>
            ) : null}
          </>
        ) : null}

        {mode === "device" ? (
          <>
            <div style={ui.title}>
              Confirmar dispositivo
            </div>

            <div style={ui.text}>
              Enviamos um código de 6 dígitos para
              o e-mail da sua conta.
            </div>

            {cleanEmail ? (
              <div
                style={{
                  ...ui.text,
                  marginTop: 10,
                }}
              >
                E-mail: {cleanEmail}
              </div>
            ) : null}

            {cleanSlot ? (
              <div
                style={{
                  ...ui.text,
                  marginTop: 4,
                }}
              >
                Dispositivo: {cleanSlot}
              </div>
            ) : null}

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => {
                const digits =
                  String(event.target.value || "")
                    .replace(/\D/g, "")
                    .slice(0, 6);

                setCode(digits);
              }}
              placeholder="000000"
              style={ui.input}
              disabled={busy}
              aria-label="Código de confirmação"
            />
          </>
        ) : null}

        {mode === "error" ? (
          <>
            <div style={ui.title}>
              Não foi possível validar o acesso
            </div>

            <div style={ui.text}>
              O acesso protegido não foi liberado.
            </div>
          </>
        ) : null}

        {error ? (
          <div style={ui.error}>
            {error}
          </div>
        ) : null}

        <div style={ui.actions}>
          {mode === "device" ? (
            <button
              type="button"
              style={ui.primary}
              disabled={
                busy ||
                code.length !== 6
              }
              onClick={confirmCode}
            >
              {busy
                ? "VALIDANDO..."
                : "CONFIRMAR DISPOSITIVO"}
            </button>
          ) : null}

          {typeof onRetry === "function" ? (
            <button
              type="button"
              style={ui.primary}
              disabled={busy}
              onClick={onRetry}
            >
              {busy
                ? "VERIFICANDO..."
                : "VERIFICAR ACESSO"}
            </button>
          ) : null}

          {typeof onLogout === "function" ? (
            <button
              type="button"
              style={ui.secondary}
              disabled={busy}
              onClick={onLogout}
            >
              SAIR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}