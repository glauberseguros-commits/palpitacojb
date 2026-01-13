// src/pages/Account/LoginVisual.jsx
import React, { useMemo, useState } from "react";

/**
 * LoginVisual (apenas visual, sem autenticação real)
 * - Props esperadas pelo App.js:
 *   - onEnter({ loginId })
 *   - onSkip()
 *
 * ✅ Export DEFAULT obrigatório:
 * export default function LoginVisual() {}
 */

function normalizeDigitsOnly(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

export default function LoginVisual({ onEnter, onSkip }) {
  const ui = useMemo(() => {
    const BORDER = "rgba(255,255,255,0.12)";
    const BORDER2 = "rgba(255,255,255,0.08)";
    const GOLD = "rgba(201,168,62,0.92)";

    return {
      root: {
        minHeight: "100vh",
        background: "#050505",
        color: "rgba(255,255,255,0.94)",
        display: "grid",
        placeItems: "center",
        padding: 18,
      },

      card: {
        width: "min(520px, 94vw)",
        borderRadius: 18,
        border: `1px solid ${BORDER2}`,
        background:
          "radial-gradient(520px 320px at 35% 10%, rgba(201,168,62,0.10) 0%, rgba(0,0,0,0) 60%), rgba(0,0,0,0.55)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.65)",
        overflow: "hidden",
      },

      header: {
        padding: 18,
        borderBottom: `1px solid ${BORDER2}`,
        display: "grid",
        gap: 6,
      },

      title: { fontWeight: 1000, letterSpacing: 0.35, fontSize: 18 },
      subtitle: { opacity: 0.82, fontWeight: 700, lineHeight: 1.35, fontSize: 13 },

      body: { padding: 18, display: "grid", gap: 12 },

      field: { display: "grid", gap: 6 },
      label: { fontSize: 12, opacity: 0.8, fontWeight: 800 },

      input: {
        height: 44,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        background: "rgba(0,0,0,0.45)",
        color: "rgba(255,255,255,0.92)",
        padding: "0 12px",
        outline: "none",
        fontWeight: 800,
        letterSpacing: 0.2,
      },

      row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },

      actions: {
        padding: 18,
        borderTop: `1px solid ${BORDER2}`,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 10,
      },

      btn: (variant) => ({
        height: 44,
        borderRadius: 12,
        border: `1px solid ${
          variant === "primary" ? "rgba(201,168,62,0.42)" : BORDER2
        }`,
        background:
          variant === "primary"
            ? "linear-gradient(180deg, rgba(201,168,62,0.18), rgba(0,0,0,0.25))"
            : "rgba(0,0,0,0.25)",
        color: "rgba(255,255,255,0.94)",
        cursor: "pointer",
        fontWeight: 1000,
        letterSpacing: 0.35,
        boxShadow: variant === "primary" ? "0 14px 34px rgba(0,0,0,0.55)" : "none",
      }),

      goldPip: {
        height: 6,
        width: 46,
        borderRadius: 999,
        background: GOLD,
        boxShadow: "0 0 0 3px rgba(201,168,62,0.10)",
      },
    };
  }, []);

  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");

  const cpfDigits = normalizeDigitsOnly(cpf).slice(0, 11);
  const canEnter = cpfDigits.length >= 8 || String(senha || "").trim().length >= 2;

  const handleEnter = () => {
    // loginId visual (não sensível): últimos 4 dígitos do CPF, se existir
    const loginId = cpfDigits ? `CPF-${cpfDigits.slice(-4)}` : "VISUAL";
    onEnter?.({ loginId });
  };

  return (
    <div style={ui.root}>
      <div style={ui.card}>
        <div style={ui.header}>
          <div style={ui.title}>Palpitaco</div>
          <div style={ui.subtitle}>
            Login visual (sem autenticação). Ao entrar, você vai direto para o Dashboard.
          </div>
          <div style={{ marginTop: 6 }}>
            <div style={ui.goldPip} />
          </div>
        </div>

        <div style={ui.body}>
          <div style={ui.field}>
            <div style={ui.label}>CPF (apenas visual)</div>
            <input
              style={ui.input}
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              placeholder="Digite seu CPF"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          <div style={ui.field}>
            <div style={ui.label}>Senha (apenas visual)</div>
            <input
              style={ui.input}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite sua senha"
              type="password"
              autoComplete="off"
            />
          </div>

          <div style={{ opacity: 0.72, fontSize: 12, lineHeight: 1.35 }}>
            Dica: este login é só para UX. Depois a gente pluga autenticação real se você quiser.
          </div>
        </div>

        <div style={ui.actions}>
          <button type="button" style={ui.btn("secondary")} onClick={() => onSkip?.()}>
            ENTRAR SEM LOGIN
          </button>

          <button
            type="button"
            style={ui.btn("primary")}
            onClick={handleEnter}
            disabled={!canEnter}
            title={!canEnter ? "Preencha CPF ou senha (visual)" : "Entrar"}
          >
            ENTRAR
          </button>
        </div>
      </div>
    </div>
  );
}
