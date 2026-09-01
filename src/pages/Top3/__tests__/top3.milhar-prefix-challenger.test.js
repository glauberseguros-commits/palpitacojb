import {
  TOP3_MILHAR_PREFIX_CHALLENGER_VERSION,
  getTop3MilharPrefixPolicyDecision,
  getTop3MilharPrefixPolicyStats,
} from "../modules/top3.milhar-prefix-challenger";

describe(
  "TOP3 milhar prefix challenger production contract",
  () => {
    test(
      "frozen policy identity",
      () => {
        expect(
          TOP3_MILHAR_PREFIX_CHALLENGER_VERSION
        ).toBe(
          "PALPITACO_MILHAR_PREFIX_CHALLENGER_PRODUCTION_V1"
        );

        const stats =
          getTop3MilharPrefixPolicyStats();

        expect(
          stats.contexts
        ).toBe(548);

        expect(
          stats.challengerContexts
        ).toBe(131);

        expect(
          stats.variants
        ).toBe(68);
      }
    );

    test(
      "never activates before 2026-09-01",
      () => {
        expect(
          getTop3MilharPrefixPolicyDecision({
            lottery:
              "NACIONAL",
            ymd:
              "2026-08-31",
            hour:
              "08:00",
            group:
              1,
          }).mode
        ).toBe(
          "CURRENT"
        );
      }
    );

    test(
      "PT_RIO and FEDERAL stay current",
      () => {
        expect(
          getTop3MilharPrefixPolicyDecision({
            lottery:
              "PT_RIO",
            ymd:
              "2026-09-01",
            hour:
              "09:00",
            group:
              1,
          }).mode
        ).toBe(
          "CURRENT"
        );

        expect(
          getTop3MilharPrefixPolicyDecision({
            lottery:
              "FEDERAL",
            ymd:
              "2026-09-02",
            hour:
              "20:00",
            group:
              1,
          }).mode
        ).toBe(
          "CURRENT"
        );
      }
    );
  }
);
