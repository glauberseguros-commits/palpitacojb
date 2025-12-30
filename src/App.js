// src/App.js
import React, { useEffect, useMemo, useState } from "react";
import Dashboard from "./pages/Dashboard/Dashboard";

/**
 * App (Palpitaco)
 * - Mantém o Dashboard novo como tela principal
 * - Prepara o “login visual” (sem autenticação) como você definiu no projeto
 * - Sem dependência externa (sem router)
 * - Fluxo simples: Login -> Dashboard
 *
 * Se você quiser desativar o login e abrir direto no Dashboard:
 * - troque INITIAL_SCREEN para "dashboard"
 */

const INITIAL_SCREEN = "login"; // "login" | "dashboard"
const STORAGE_KEY = "palpitaco_screen_v1";

export default function App() {
  const initial = useMemo(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "login" || saved === "dashboard") return saved;
    } catch {}
    return INITIAL_SCREEN;
  }, []);

  const [screen, setScreen] = useState(initial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, screen);
    } catch {}
  }, [screen]);

  if (screen === "dashboard") {
    return <Dashboard />;
  }

  return (
    <LoginVisual
      onEnter={() => setScreen("dashboard")}
      onSkip={() => setScreen("dashboard")}
    />
  );
}

/* =========================
   LOGIN VISUAL (premium shell)
   - Sem autenticação real
   - Apenas experiência visual + navegação
   - Desktop: sem scroll (encaixe 100% no viewport)
========================= */

function LoginVisual({ onEnter, onSkip }) {
  const ui = useMemo(() => {
    const BORDER = "rgba(255,255,255,0.16)";
    const BORDER_SOFT = "rgba(255,255,255,0.10)";
    const GLASS = "rgba(0,0,0,0.62)";
    const GOLD = "rgba(201,168,62,0.92)";

    return {
      root: {
        /* antes: minHeight: "100vh" (pode estourar com padding) */
        height: "100vh",
        minHeight: 0,

        background: "#050505",
        color: "rgba(255,255,255,0.95)",
        display: "grid",
        placeItems: "center",

        padding: 18,
        boxSizing: "border-box",

        position: "relative",
        overflow: "hidden",
      },

      // Fundo premium
      bg: {
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(1200px 650px at 20% 20%, rgba(201,168,62,0.12) 0%, rgba(0,0,0,0) 55%), radial-gradient(900px 520px at 80% 30%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 60%), radial-gradient(900px 520px at 40% 90%, rgba(201,168,62,0.08) 0%, rgba(0,0,0,0) 60%)",
        pointerEvents: "none",
      },

      card: {
        width: "min(980px, 100%)",
        border: `1px solid ${BORDER}`,
        borderRadius: 18,
        background: GLASS,
        boxShadow: "0 24px 70px rgba(0,0,0,0.65)",
        overflow: "hidden",
        position: "relative",
        display: "grid",
        gridTemplateColumns: "1.1fr 0.9fr",

        /* garante encaixe sem scroll: respeita padding 18+18 */
        maxHeight: "calc(100vh - 36px)",
        minHeight: 0,
      },

      left: {
        padding: 26,
        position: "relative",
        minHeight: 0,
      },

      right: {
        padding: 26,
        borderLeft: `1px solid ${BORDER_SOFT}`,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
        minHeight: 0,
      },

      brandRow: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        marginBottom: 18,
      },

      logo: {
        width: 48,
        height: 48,
        borderRadius: 14,
        border: `1px solid ${BORDER_SOFT}`,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.35)",
      },

      logoImg: {
        width: 34,
        height: 34,
        objectFit: "contain",
        display: "block",
        opacity: 0.95,
      },

      brandTitle: {
        fontWeight: 1000,
        letterSpacing: 0.6,
        fontSize: 22,
      },

      brandSub: {
        opacity: 0.8,
        marginTop: 4,
        fontWeight: 700,
      },

      headline: {
        marginTop: 18,
        fontSize: 34,
        lineHeight: 1.05,
        fontWeight: 1000,
        letterSpacing: 0.2,
      },

      gold: { color: GOLD },

      copy: {
        marginTop: 12,
        opacity: 0.82,
        fontWeight: 700,
        lineHeight: 1.45,
        maxWidth: 520,
      },

      bullets: {
        marginTop: 16,
        display: "grid",
        gap: 10,
      },

      bullet: {
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      },

      dot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        background: GOLD,
        marginTop: 7,
        boxShadow: "0 0 0 3px rgba(201,168,62,0.10)",
        flex: "0 0 auto",
      },

      formTitle: {
        fontWeight: 1000,
        letterSpacing: 0.3,
        fontSize: 16,
        marginBottom: 12,
      },

      field: {
        display: "grid",
        gap: 6,
        marginBottom: 12,
      },

      label: {
        fontWeight: 900,
        opacity: 0.9,
        letterSpacing: 0.2,
        fontSize: 13,
      },

      input: {
        height: 44,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        padding: "0 12px",
        outline: "none",
        width: "100%",
        fontWeight: 800,
        letterSpacing: 0.2,
        boxSizing: "border-box",
      },

      row: {
        display: "flex",
        gap: 10,
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 6,
      },

      btnPrimary: {
        height: 44,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.18)",
        background:
          "linear-gradient(180deg, rgba(201,168,62,0.95), rgba(165,138,21,0.88))",
        color: "rgba(0,0,0,0.92)",
        fontWeight: 1000,
        letterSpacing: 0.35,
        padding: "0 14px",
        cursor: "pointer",
        width: "100%",
      },

      btnGhost: {
        height: 44,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        background: "rgba(0,0,0,0.35)",
        color: "rgba(255,255,255,0.92)",
        fontWeight: 900,
        letterSpacing: 0.25,
        padding: "0 14px",
        cursor: "pointer",
        width: "100%",
      },

      hint: {
        marginTop: 12,
        opacity: 0.72,
        fontSize: 12,
        lineHeight: 1.35,
      },

      styleTag: `
        @media (max-width: 980px){
          .pp_login_card{ grid-template-columns: 1fr !important; max-height: none !important; }
          .pp_login_right{ border-left: none !important; border-top: 1px solid rgba(255,255,255,0.10) !important; }
        }
        .pp_login_input:focus{
          border-color: rgba(201,168,62,0.55) !important;
          box-shadow: 0 0 0 3px rgba(201,168,62,0.14) !important;
        }
        .pp_login_btn:active{ transform: translateY(1px); }
      `,
    };
  }, []);

  // Login visual: não validamos nada, mas mantém a aparência “real”
  const [cpf, setCpf] = useState("");
  const [senha, setSenha] = useState("");

  const enter = (e) => {
    e?.preventDefault?.();
    onEnter?.({ cpf, senha });
  };

  return (
    <div style={ui.root}>
      <style>{ui.styleTag}</style>
      <div style={ui.bg} />

      <div className="pp_login_card" style={ui.card}>
        <div style={ui.left}>
          <div style={ui.brandRow}>
            <div style={ui.logo} aria-hidden="true">
              <img
                src="/logo_palpitaco.png"
                alt=""
                style={ui.logoImg}
                onError={(e) => {
                  // se não existir a imagem, não quebra o layout
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={ui.brandTitle}>PALPITACO</div>
              <div style={ui.brandSub}>Dashboard Premium • Análise Inteligente</div>
            </div>
          </div>

          <div style={ui.headline}>
            Bem-vindo ao <span style={ui.gold}>Palpitaco</span>.
          </div>

          <div style={ui.copy}>
            Um painel premium para explorar padrões por mês, dia, horário, animal e posição
            com consistência visual e performance.
          </div>

          <div style={ui.bullets}>
            <div style={ui.bullet}>
              <span style={ui.dot} />
              <div>
                <strong>Filtro rápido</strong> com layout limpo e responsivo.
              </div>
            </div>
            <div style={ui.bullet}>
              <span style={ui.dot} />
              <div>
                <strong>Ranking lateral</strong> com destaque para Top 3.
              </div>
            </div>
            <div style={ui.bullet}>
              <span style={ui.dot} />
              <div>
                <strong>Cards e gráficos</strong> prontos para dados reais.
              </div>
            </div>
          </div>

          <div style={ui.hint}>
            Este login é apenas visual (sem autenticação). Ao clicar em “ENTRAR”, você
            acessa os rankings.
          </div>
        </div>

        <div className="pp_login_right" style={ui.right}>
          <div style={ui.formTitle}>Acesso</div>

          <form onSubmit={enter}>
            <div style={ui.field}>
              <div style={ui.label}>CPF</div>
              <input
                className="pp_login_input"
                style={ui.input}
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </div>

            <div style={ui.field}>
              <div style={ui.label}>Senha</div>
              <input
                className="pp_login_input"
                style={ui.input}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
                type="password"
              />
            </div>

            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              <button type="submit" className="pp_login_btn" style={ui.btnPrimary}>
                ENTRAR
              </button>

              <button
                type="button"
                className="pp_login_btn"
                style={ui.btnGhost}
                onClick={() => onSkip?.()}
              >
                Entrar sem CPF
              </button>
            </div>
          </form>

          <div style={ui.hint}>
            Dica: quando você quiser, eu transformo esse login em autenticação real
            (Firebase/Auth ou outro), mantendo o mesmo visual premium.
          </div>
        </div>
      </div>
    </div>
  );
}
