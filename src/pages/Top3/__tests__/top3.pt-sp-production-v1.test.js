import { createHash } from "crypto";

import {
  getScheduleForLottery,
} from "../top3.engine";

import {
  getTop3ProductionProfileAssignment,
  resolveTop3ProductionProfileLotteryKey,
} from "../modules/top3.production-profile-map";

import {
  getPtSpScheduleForYmd,
  PT_SP_FORMAL_TRANSITION_DATE_CLAIMED,
} from "../modules/top3.pt-sp-calendar";

import {
  PT_SP_BASELINE_V3_PRODUCTION_VERSION,
  PT_SP_BASELINE56_CONTEXT_COUNT,
  PT_SP_BASELINE56_CONTEXT_MATRIX,
  PT_SP_BASELINE56_MATRIX_CERTIFICATE_SHA256,
  computePtSpProductionV1Top3,
} from "../modules/top3.pt-sp-production-v1";


describe(
  "PT_SP_BASELINE_V3_PRODUCTION_V1",
  () => {

    test(
      "preserves PT_SP historical source availability",
      () => {

        expect(
          getPtSpScheduleForYmd(
            "2022-07-05"
          )
        ).toEqual([]);

        expect(
          getPtSpScheduleForYmd(
            "2022-07-06"
          )
        ).toEqual([
          "13:00",
          "15:00",
          "20:00",
        ]);

        expect(
          getPtSpScheduleForYmd(
            "2022-07-07"
          )
        ).toEqual([
          "10:00",
          "13:00",
          "15:00",
          "20:00",
        ]);

        expect(
          getPtSpScheduleForYmd(
            "2023-06-03"
          )
        ).toContain(
          "17:00"
        );

        expect(
          getPtSpScheduleForYmd(
            "2024-04-11"
          )
        ).toContain(
          "08:00"
        );

        expect(
          getPtSpScheduleForYmd(
            "2024-06-11"
          )
        ).toContain(
          "12:00"
        );

        expect(
          getPtSpScheduleForYmd(
            "2024-06-14"
          )
        ).toEqual([
          "08:00",
          "10:00",
          "12:00",
          "13:00",
          "15:00",
          "17:00",
          "19:00",
          "20:00",
        ]);
      }
    );


    test(
      "preserves PT_SP current observed regime",
      () => {

        expect(
          getPtSpScheduleForYmd(
            "2026-08-26"
          )
        ).toEqual([
          "08:00",
          "10:00",
          "12:00",
          "13:00",
          "15:00",
          "17:00",
          "19:00",
        ]);

        expect(
          getPtSpScheduleForYmd(
            "2026-08-29"
          )
        ).toEqual([
          "08:00",
          "10:00",
          "12:00",
          "13:00",
          "15:00",
          "17:00",
          "20:00",
        ]);

        expect(
          getPtSpScheduleForYmd(
            "2026-08-30"
          )
        ).toEqual([
          "08:00",
          "10:00",
          "12:00",
          "13:00",
          "15:00",
          "17:00",
          "19:00",
          "20:00",
        ]);

        expect(
          PT_SP_FORMAL_TRANSITION_DATE_CLAIMED
        ).toBe(false);
      }
    );


    test(
      "shared schedule entry routes PT_SP to dedicated calendar",
      () => {

        for (
          const ymd of [
            "2022-07-06",
            "2024-06-14",
            "2026-08-26",
            "2026-08-29",
            "2026-08-30",
          ]
        ) {

          expect(
            getScheduleForLottery({
              lotteryKey:
                "PT_SP",

              ymd,
            })
          ).toEqual(
            getPtSpScheduleForYmd(
              ymd
            )
          );
        }
      }
    );


    test(
      "PT_SP profile is explicitly PT_SP",
      () => {

        expect(
          resolveTop3ProductionProfileLotteryKey(
            "PT_SP"
          )
        ).toBe(
          "PT_SP"
        );

        const assignment =
          getTop3ProductionProfileAssignment(
            "PT_SP"
          );

        expect(
          assignment
            .targetLotteryKey
        ).toBe(
          "PT_SP"
        );

        expect(
          assignment
            .profileLotteryKey
        ).toBe(
          "PT_SP"
        );

        expect(
          assignment.crossed
        ).toBe(false);
      }
    );


    test(
      "all 56 PT_SP contexts are BASELINE_V3",
      () => {

        expect(
          PT_SP_BASELINE56_CONTEXT_COUNT
        ).toBe(56);

        expect(
          new Set(
            Object.values(
              PT_SP_BASELINE56_CONTEXT_MATRIX
            )
          )
        ).toEqual(
          new Set([
            "BASELINE_V3",
          ])
        );

        const digest =
          createHash(
            "sha256"
          )
            .update(
              JSON.stringify(
                PT_SP_BASELINE56_CONTEXT_MATRIX
              ),
              "utf8"
            )
            .digest(
              "hex"
            );

        expect(
          digest
        ).toBe(
          PT_SP_BASELINE56_MATRIX_CERTIFICATE_SHA256
        );
      }
    );


    test(
      "PT_SP production preserves generic V3 ranking",
      () => {

        const baseOutput = {
          top: [
            {
              grupo: 3,
              score: 10,
            },
            {
              grupo: 8,
              score: 9,
            },
            {
              grupo: 21,
              score: 8,
            },
          ],

          meta: {
            next: {
              ymd:
                "2026-09-01",

              hour:
                "08:00",
            },

            explain: {
              preservedMarker:
                "BASELINE",
            },
          },
        };

        const baseCompute =
          jest.fn(
            () =>
              baseOutput
          );

        const result =
          computePtSpProductionV1Top3({
            input: {
              lotteryKey:
                "PT_SP",

              targetYmdOverride:
                "2026-09-01",

              targetHourOverride:
                "08:00",
            },

            baseCompute,
          });

        expect(
          baseCompute
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          baseCompute
            .mock
            .calls[0][0]
            .lotteryKey
        ).toBe(
          "PT_SP"
        );

        expect(
          result.top
        ).toBe(
          baseOutput.top
        );

        expect(
          result.meta
            .scenario
        ).toBe(
          PT_SP_BASELINE_V3_PRODUCTION_VERSION
        );

        expect(
          result.meta
            .explain
            .preservedMarker
        ).toBe(
          "BASELINE"
        );

        expect(
          result.meta
            .explain
            .ptSpProduction
            .lotteryKey
        ).toBe(
          "PT_SP"
        );

        expect(
          result.meta
            .explain
            .ptSpProduction
            .specialistWeightsInherited
        ).toBe(false);

        expect(
          result.meta
            .explain
            .ptSpProduction
            .rankingMutation
        ).toBe(false);
      }
    );
  }
);
