import React from "react";

const SUPPORT_DISPLAY =
  "+55 (61) 9 9987-8710";

const SUPPORT_URL =
  "https://wa.me/5561999878710";

const SUPPORT_EMAIL =
  "contato@palpitacojb.com.br";

const VERSION =
  "02/09/2026";

const terms = [
  {
    title:
      "1. Sobre o PalPitaco JB",
    body:
      "O PalPitaco JB disponibiliza ferramentas de estatística, leitura, análise, rankings, resultados e conteúdos informativos relacionados às loterias e modalidades exibidas na plataforma. As informações apresentadas possuem caráter analítico e informativo e não constituem garantia de prêmio, ganho ou resultado.",
  },
  {
    title:
      "2. Conta e credenciais",
    body:
      "O acesso é pessoal e vinculado à conta cadastrada. O usuário é responsável pela veracidade dos dados informados e pela confidencialidade de suas credenciais. É vedado compartilhar credenciais ou tentar contornar controles de acesso, dispositivo ou sessão.",
  },
  {
    title:
      "3. Assinatura",
    body:
      "O plano vigente do PalPitaco JB custa R$ 49,90 e concede 30 dias de acesso após a confirmação do pagamento. A assinatura não é renovada automaticamente.",
  },
  {
    title:
      "4. Pagamento e liberação",
    body:
      "O pagamento é realizado por PIX. O envio do comprovante não produz liberação automática. O acesso é ativado após conferência administrativa do pagamento.",
  },
  {
    title:
      "5. Vigência",
    body:
      "Os 30 dias de acesso são contados a partir da ativação administrativa. Em uma renovação realizada antes do vencimento, o período adicional poderá ser acrescentado à validade existente conforme o registro autoritativo da plataforma.",
  },
  {
    title:
      "6. Dispositivos e sessão",
    body:
      "O PalPitaco JB pode aplicar controles de dispositivo autorizado e sessão ativa para reduzir compartilhamento indevido de contas e proteger o conteúdo contratado.",
  },
  {
    title:
      "7. Disponibilidade",
    body:
      "A plataforma poderá passar por manutenção, atualização, correção de segurança ou indisponibilidade temporária. O PalPitaco JB busca manter o serviço disponível, mas não garante funcionamento ininterrupto.",
  },
  {
    title:
      "8. Propriedade intelectual",
    body:
      "A identidade visual, interface, motores, rankings, análises, textos, estruturas e demais conteúdos próprios do PalPitaco JB são protegidos pela legislação aplicável e não podem ser reproduzidos ou redistribuídos sem autorização.",
  },
  {
    title:
      "9. Uso responsável",
    body:
      "O usuário reconhece que decisões financeiras ou apostas realizadas a partir de informações da plataforma são de sua exclusiva responsabilidade. O PalPitaco JB não garante resultados futuros.",
  },
  {
    title:
      "10. Atendimento",
    body:
      "Dúvidas sobre cadastro, pagamento, assinatura ou acesso podem ser encaminhadas ao suporte oficial informado nesta página.",
  },
];

const privacy = [
  {
    title:
      "1. Dados tratados",
    body:
      "O PalPitaco JB pode tratar dados fornecidos pelo usuário, como nome, telefone e e-mail, além do identificador da conta de autenticação e informações técnicas necessárias para segurança, dispositivo e sessão.",
  },
  {
    title:
      "2. Finalidades",
    body:
      "Os dados são utilizados para autenticação, manutenção do perfil, controle de assinatura, segurança da conta, prevenção de compartilhamento indevido, suporte e funcionamento operacional da plataforma.",
  },
  {
    title:
      "3. Pagamentos",
    body:
      "As informações de pagamento e referências de confirmação podem ser registradas para comprovar a contratação, ativação, renovação e histórico administrativo da assinatura.",
  },
  {
    title:
      "4. Segurança",
    body:
      "O PalPitaco JB utiliza mecanismos de autenticação e controles técnicos de acesso. Segredos de sessão e credenciais de dispositivo devem ser tratados de forma restrita pelos sistemas responsáveis.",
  },
  {
    title:
      "5. Prestadores tecnológicos",
    body:
      "Serviços de infraestrutura, autenticação, banco de dados, hospedagem e comunicação podem processar informações estritamente necessárias à execução da plataforma, observadas suas respectivas políticas e obrigações aplicáveis.",
  },
  {
    title:
      "6. Retenção",
    body:
      "Os dados podem ser mantidos enquanto forem necessários para prestação do serviço, cumprimento de obrigações legais, segurança, auditoria e exercício regular de direitos.",
  },
  {
    title:
      "7. Direitos do titular",
    body:
      "O titular poderá solicitar informações e exercer os direitos previstos na legislação brasileira de proteção de dados pelos canais oficiais de atendimento do PalPitaco JB.",
  },
  {
    title:
      "8. Alterações",
    body:
      "Esta Política de Privacidade poderá ser atualizada para refletir mudanças legais, técnicas ou operacionais. A versão vigente permanecerá disponível na plataforma.",
  },
];

export default function LegalPage({
  kind = "terms",
}) {
  const isPrivacy =
    kind === "privacy";

  const title =
    isPrivacy
      ? "Política de Privacidade"
      : "Termos de Uso";

  const sections =
    isPrivacy
      ? privacy
      : terms;

  return (
    <main
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        background: "#030303",
        color:
          "rgba(255,255,255,0.88)",
        padding: "28px 16px",
      }}
    >
      <article
        style={{
          width: "100%",
          maxWidth: 820,
          margin: "0 auto",
          padding: "26px 24px",
          boxSizing: "border-box",
          borderRadius: 20,
          border:
            "1px solid rgba(202,166,75,0.28)",
          background:
            "linear-gradient(180deg, rgba(17,14,7,0.98), rgba(3,3,3,0.99))",
          boxShadow:
            "0 24px 80px rgba(0,0,0,0.50)",
        }}
      >
        <header
          style={{
            textAlign: "center",
            paddingBottom: 20,
            borderBottom:
              "1px solid rgba(202,166,75,0.14)",
          }}
        >
          <img
            src="/logo/palpitaco-jb.png"
            alt="PalPitaco JB"
            style={{
              width: 110,
              height: 110,
              objectFit: "contain",
            }}
          />

          <div
            style={{
              marginTop: 6,
              color: "#d7b84c",
              fontSize: 10,
              fontWeight: 950,
              letterSpacing: 1.5,
            }}
          >
            PALPITACO JB
          </div>

          <h1
            style={{
              margin:
                "8px 0 0",
              fontSize: 28,
            }}
          >
            {title}
          </h1>

          <div
            style={{
              marginTop: 7,
              opacity: 0.58,
              fontSize: 11.5,
            }}
          >
            Versão vigente: {VERSION}
          </div>
        </header>

        <div
          style={{
            display: "grid",
            gap: 22,
            marginTop: 24,
          }}
        >
          {sections.map(
            (section) => (
              <section
                key={section.title}
              >
                <h2
                  style={{
                    margin: 0,
                    color: "#d7b84c",
                    fontSize: 15,
                  }}
                >
                  {section.title}
                </h2>

                <p
                  style={{
                    margin:
                      "8px 0 0",
                    fontSize: 13,
                    lineHeight: 1.7,
                    opacity: 0.84,
                  }}
                >
                  {section.body}
                </p>
              </section>
            )
          )}
        </div>

        <footer
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop:
              "1px solid rgba(202,166,75,0.14)",
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          <strong>
            Atendimento PalPitaco JB
          </strong>

          <div>
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "#d7b84c",
              }}
            >
              WhatsApp: {SUPPORT_DISPLAY}
            </a>
          </div>

          <div>
            <a
              href={"mailto:" + SUPPORT_EMAIL}
              style={{
                color: "#d7b84c",
              }}
            >
              {SUPPORT_EMAIL}
            </a>
          </div>

          <div
            style={{
              marginTop: 16,
              textAlign: "center",
            }}
          >
            <a
              href="/login?product=jb"
              style={{
                color: "#d7b84c",
              }}
            >
              Voltar ao PalPitaco JB
            </a>
          </div>
        </footer>
      </article>
    </main>
  );
}