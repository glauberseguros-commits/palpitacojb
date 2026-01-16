// src/pages/Account/LoginVisual.jsx
import React from "react";

const ACCOUNT_SESSION_KEY = "pp_session_v1";
const LS_GUEST_ACTIVE_KEY = "pp_guest_active_v1";

function dispatchSessionChanged() {
  try {
    window.dispatchEvent(new Event("pp_session_changed"));
  } catch {}
}

function safeSetLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export default function LoginVisual({ onEnter }) {
  const enterAsGuest = () => {
    // ✅ marca guest
    safeSetLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ ok: true, type: "guest", plan: "FREE", ts: Date.now() })
    );
    safeSetLS(LS_GUEST_ACTIVE_KEY, "1");

    // ✅ avisa o App.js no mesmo tab
    dispatchSessionChanged();

    // fallback: se o pai quiser navegar
    onEnter?.("dashboard");
  };

  const enterLogin = () => {
    // login visual (sem auth real)
    // ✅ marca user e desliga guest ativo (se sobrou)
    safeSetLS(
      ACCOUNT_SESSION_KEY,
      JSON.stringify({ ok: true, type: "user", plan: "FREE", ts: Date.now() })
    );
    safeSetLS(LS_GUEST_ACTIVE_KEY, "0");

    // ✅ avisa o App.js no mesmo tab
    dispatchSessionChanged();

    onEnter?.("dashboard");
  };

  return (
    <div
      style={{
        height: "100vh",
        background: "#050505",
        color: "#fff",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ width: 320, display: "grid", gap: 14 }}>
        <h2 style={{ textAlign: "center" }}>Palpitaco</h2>

        <button onClick={enterLogin}>Entrar</button>
        <button onClick={enterAsGuest}>Entrar sem login (Preview)</button>
      </div>
    </div>
  );
}
