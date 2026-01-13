// src/pages/Payments/Payments.jsx
import React from "react";

export default function Payments() {
  return (
    <div style={{ padding: 22 }}>
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(202,166,75,0.16)",
          background: "rgba(0,0,0,0.35)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 18,
          color: "rgba(255,255,255,0.92)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 0.3 }}>
          Pagamentos
        </div>

        <div style={{ marginTop: 10, lineHeight: 1.5, color: "rgba(255,255,255,0.78)" }}>
          Esta tela está em modo esqueleto (Opção B).
          <br />
          Mercado Pago e domínio serão integrados depois.
        </div>

        <div style={{ marginTop: 14, color: "rgba(202,166,75,0.95)", fontWeight: 800 }}>
          Regras (planejamento):
        </div>

        <ul style={{ marginTop: 8, paddingLeft: 18, color: "rgba(255,255,255,0.78)" }}>
          <li>Usuário novo: entra Free e recebe Trial de 24h.</li>
          <li>Premium: 30 dias após confirmação do pagamento.</li>
          <li>Expirou premium: volta automaticamente para Free.</li>
          <li>Renovação pode ocorrer a qualquer momento.</li>
          <li>Pagamento mínimo planejado: R$ 10,00 / 30 dias.</li>
        </ul>

        <div style={{ marginTop: 12, fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
          Próximo passo desta tela: layout do plano + CTA + status do usuário (free/trial/premium).
        </div>
      </div>
    </div>
  );
}
