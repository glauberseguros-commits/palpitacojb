import {
  getRadarScheduleForDate,
} from "./radarSchedule";

describe(
  "Radar date-aware schedule",
  () => {
    test(
      "RJ sexta usa grade normal",
      () => {
        expect(
          getRadarScheduleForDate(
            "PT_RIO",
            "2026-09-25"
          )
        ).toEqual([
          "09:00",
          "11:00",
          "14:00",
          "16:00",
          "18:00",
          "21:00",
        ]);
      }
    );

    test(
      "RJ quarta nao possui 18h",
      () => {
        expect(
          getRadarScheduleForDate(
            "PT_RIO",
            "2026-09-23"
          )
        ).toEqual([
          "09:00",
          "11:00",
          "14:00",
          "16:00",
          "21:00",
        ]);
      }
    );

    test(
      "RJ sabado atual troca 18h por 19:30",
      () => {
        expect(
          getRadarScheduleForDate(
            "PT_RIO",
            "2026-09-26"
          )
        ).toEqual([
          "09:00",
          "11:00",
          "14:00",
          "16:00",
          "19:30",
          "21:00",
        ]);
      }
    );

    test(
      "RJ domingo atual possui somente 14h e 16h",
      () => {
        expect(
          getRadarScheduleForDate(
            "PT_RIO",
            "2026-09-27"
          )
        ).toEqual([
          "14:00",
          "16:00",
        ]);
      }
    );

    test(
      "RJ antes de 05/01/2024 nao possui 09h",
      () => {
        expect(
          getRadarScheduleForDate(
            "PT_RIO",
            "2024-01-04"
          )
        ).toEqual([
          "11:00",
          "14:00",
          "16:00",
          "18:00",
          "21:00",
        ]);
      }
    );

    test(
      "Federal atual domingo e 11:30",
      () => {
        expect(
          getRadarScheduleForDate(
            "FEDERAL",
            "2026-09-27"
          )
        ).toEqual([
          "11:30",
        ]);
      }
    );

    test(
      "Federal atual quarta e 20h",
      () => {
        expect(
          getRadarScheduleForDate(
            "FEDERAL",
            "2026-09-23"
          )
        ).toEqual([
          "20:00",
        ]);
      }
    );

    test(
      "Federal atual sabado nao possui sorteio",
      () => {
        expect(
          getRadarScheduleForDate(
            "FEDERAL",
            "2026-09-26"
          )
        ).toEqual([]);
      }
    );

    test(
      "Federal em 18/07/2026 ainda era sabado 20h",
      () => {
        expect(
          getRadarScheduleForDate(
            "FEDERAL",
            "2026-07-18"
          )
        ).toEqual([
          "20:00",
        ]);
      }
    );

    test(
      "Federal historico anterior a transicao de 2025 usa 19h",
      () => {
        expect(
          getRadarScheduleForDate(
            "FEDERAL",
            "2025-11-01"
          )
        ).toEqual([
          "19:00",
        ]);
      }
    );

    test(
      "SP remove 20h somente em 02/09/2026",
      () => {
        const day =
          getRadarScheduleForDate(
            "PT_SP",
            "2026-09-02"
          );

        expect(
          day.includes(
            "20:00"
          )
        ).toBe(false);

        expect(
          getRadarScheduleForDate(
            "PT_SP",
            "2026-09-03"
          ).includes(
            "20:00"
          )
        ).toBe(true);
      }
    );

    test(
      "LOOK continua usando grade central",
      () => {
        expect(
          getRadarScheduleForDate(
            "LOOK",
            "2026-09-25"
          )
        ).toEqual([
          "07:00",
          "09:00",
          "11:00",
          "14:00",
          "16:00",
          "18:00",
          "21:00",
          "23:00",
        ]);
      }
    );

    test(
      "loteria desconhecida continua vazia",
      () => {
        expect(
          getRadarScheduleForDate(
            "LOTTERY_INEXISTENTE",
            "2026-09-25"
          )
        ).toEqual([]);
      }
    );
  }
);