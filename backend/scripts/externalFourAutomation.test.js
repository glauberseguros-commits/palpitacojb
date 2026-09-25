"use strict";

const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  parseExternalSource,
  parseCapitalShareText,
  validateSourceRows,
} =
  require(
    "./autoImportExternalFourToday"
  );

test(
  "PT_PB usa o resultado 10:05 e ignora o titulo 09:45",
  () => {
    const html = `
      <html>
        <body>
          24/09/2026
          Resultado do Jogo do Bicho PB, Paratodos 09:45
          Resultado PARATODOS - PB 10:05 h, do dia ( 24/09/2026 )
          Prêmio Milhar
          1º 5730
          2º 1612
          3º 6244
          4º 9793
          5º 7335
        </body>
      </html>
    `;

    const rows =
      parseExternalSource({
        lotteryKey:
          "PT_PB",
        date:
          "2026-09-24",
        html,
      });

    assert.deepEqual(
      rows,
      [{
        date:
          "2026-09-24",
        closeHour:
          "10:05",
        prizes: [
          "5730",
          "1612",
          "6244",
          "9793",
          "7335",
        ],
      }]
    );

    validateSourceRows({
      lotteryKey:
        "PT_PB",
      date:
        "2026-09-24",
      rows,
    });
  }
);

test(
  "AVAL_PE extrai card exato",
  () => {
    const html = `
      <html>
        <body>
          24/09/2026
          AVAL PE – PE, 19:00, 1º ao 5º
          2026-09-24 – 19:00:00
          Prêmio Milhar
          1º 7809
          2º 4959
          3º 8306
          4º 6850
          5º 4281
        </body>
      </html>
    `;

    const rows =
      parseExternalSource({
        lotteryKey:
          "AVAL_PE",
        date:
          "2026-09-24",
        html,
      });

    assert.deepEqual(
      rows,
      [{
        date:
          "2026-09-24",
        closeHour:
          "19:00",
        prizes: [
          "7809",
          "4959",
          "8306",
          "6850",
          "4281",
        ],
      }]
    );
  }
);

test(
  "TRADICIONAL extrai card exato",
  () => {
    const html = `
      <html>
        <body>
          24/09/2026
          Resultado TRADICIONAL 09:40 h, do dia ( 24/09/2026 )
          Prêmio Milhar
          1º 5609
          2º 0385
          3º 6244
          4º 7573
          5º 5007
        </body>
      </html>
    `;

    const rows =
      parseExternalSource({
        lotteryKey:
          "TRADICIONAL",
        date:
          "2026-09-24",
        html,
      });

    assert.deepEqual(
      rows,
      [{
        date:
          "2026-09-24",
        closeHour:
          "09:40",
        prizes: [
          "5609",
          "0385",
          "6244",
          "7573",
          "5007",
        ],
      }]
    );
  }
);

test(
  "CAPITAL separa data e rejeita Federal",
  () => {
    const capital =
      parseCapitalShareText(
        [
          "LT CAPITAL – 19h40",
          "Quinta-feira 24/09/2026",
          "1º 6905 – Águia",
          "2º 5550 – Galo",
          "3º 9646 – Elefante",
          "4º 0467 – Macaco",
          "5º 0621 – Cabra",
        ].join("\n")
      );

    assert.deepEqual(
      capital,
      {
        date:
          "2026-09-24",
        closeHour:
          "19:40",
        prizes: [
          "6905",
          "5550",
          "9646",
          "0467",
          "0621",
        ],
      }
    );

    const federal =
      parseCapitalShareText(
        [
          "LT CAPITAL – Federal 20 horas",
          "Quarta-feira 23/09/2026",
          "1º 0292",
          "2º 3081",
          "3º 5578",
          "4º 2304",
          "5º 5837",
        ].join("\n")
      );

    assert.equal(
      federal,
      null
    );
  }
);