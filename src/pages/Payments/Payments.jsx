import React from "react";

/**
 * PALPITACO JB — PAGAMENTOS
 *
 * Esta página permanece disponível como ponto de entrada da futura
 * experiência comercial.
 *
 * IMPORTANTE:
 * - Não declarar preços provisórios.
 * - Não declarar benefícios ainda não consolidados.
 * - Não reutilizar o contrato legado de Trial 24h / Premium 30 dias.
 * - O Trial oficial da plataforma é controlado pelo contrato atual
 *   de acesso e perfil do usuário.
 */

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
        <div
          style={{
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 0.3,
          }}
        >
          Planos e pagamentos
        </div>

        <div
          style={{
            marginTop: 10,
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          Estamos preparando a área de planos do Palpitaco JB.
        </div>

        <div
          style={{
            marginTop: 12,
            lineHeight: 1.5,
            color: "rgba(255,255,255,0.62)",
            fontSize: 13,
          }}
        >
          Os planos, benefícios e condições comerciais serão apresentados
          aqui quando a configuração comercial estiver concluída.
        </div>
      </div>
    </div>
  );
}
