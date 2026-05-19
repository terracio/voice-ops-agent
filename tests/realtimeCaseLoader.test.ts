import { describe, expect, it } from "vitest";
import {
  applyWalkProfileContract,
  loadRealtimeEvalCase,
  REALTIME_CRAWL_CONTRACT_CASE_IDS
} from "../src/evals/realtime/caseLoader";
import {
  REALTIME_CRAWL_DEFAULT_REWARD_BASIS,
  REALTIME_CRAWL_WRITE_CAPABLE_DEFAULT_REWARD_BASIS,
  REALTIME_WALK_DEGRADED_DEFAULT_REWARD_BASIS
} from "../src/evals/shared/rewardBasis";

describe("Realtime case loader", () => {
  it("loads the customer identity lookup case as a clean-audio crawl fixture", () => {
    expect(loadRealtimeEvalCase({ caseId: "customer_identity_lookup", stage: "crawl" }))
      .toMatchObject({
        audio: {
          chunk_duration_ms: 20,
          response_format: "pcm",
          sample_rate_hz: 24_000,
          source: "openai_tts"
        },
        case_id: "customer_identity_lookup",
        expected: {
          required_tools: ["lookup_customer"]
        },
        input: {
          mode: "audio"
        },
        seed_id: "maya_default",
        reward_basis: REALTIME_CRAWL_DEFAULT_REWARD_BASIS,
        stage: "crawl"
      });
    expect(
      loadRealtimeEvalCase({ caseId: "customer_identity_lookup", stage: "crawl" })
        .reward_basis
    ).not.toContain("ACTION");
  });

  it("loads the first realtime crawl contract cases", () => {
    const cases = REALTIME_CRAWL_CONTRACT_CASE_IDS.map((caseId) =>
      loadRealtimeEvalCase({ caseId, stage: "crawl" })
    );

    expect(cases.map((realtimeCase) => realtimeCase.case_id)).toEqual([
      "customer_identity_lookup",
      "missing_identity_clarification",
      "authenticated_ambiguous_date_clarification",
      "authenticated_allergy_change_escalation",
      "authenticated_payment_settlement_refusal"
    ]);
    for (const realtimeCase of cases) {
      expect(realtimeCase.stage).toBe("crawl");
      expect(realtimeCase.input.mode).toBe("audio");
      expect(realtimeCase.audio).toMatchObject({
        chunk_duration_ms: 20,
        fixture_mode: "generated_on_demand",
        response_format: "pcm",
        sample_rate_hz: 24_000,
        source: "openai_tts",
        stable_for_gating: false
      });
      expect(realtimeCase.expected.intent).toEqual(expect.any(String));
      expect(realtimeCase.expected.expected_final_state.changed).toBe(false);
      expect(realtimeCase.expected.required_tools).toEqual(expect.any(Array));
      expect(realtimeCase.expected.forbidden_tools).toEqual(expect.any(Array));
    }
    expect(cases[2]?.expected.expected_policy_ids).toContain("P002_AMBIGUOUS_DATE");
    expect(cases[2]?.setup?.initial_session_state).toMatchObject({
      identity_status: "confirmed",
      resolved_customer_id: "cus_001"
    });
    expect(cases[3]?.expected.expected_policy_ids).toContain(
      "P008_MEDICAL_RISK_ESCALATION_REQUIRED"
    );
    expect(cases[3]?.setup?.initial_session_state?.identity_status).toBe("confirmed");
    expect(cases[4]?.expected.required_tools).toEqual([]);
    expect(cases[4]?.setup?.initial_session_state?.identity_status).toBe("confirmed");
    expect(cases[4]?.expected.response.should_request_confirmation).toBe(true);
    expect(cases[4]?.reward_basis).toEqual(
      REALTIME_CRAWL_WRITE_CAPABLE_DEFAULT_REWARD_BASIS
    );
  });

  it("loads authenticated realtime setup for targeted Crawl cases", () => {
    const realtimeCase = loadRealtimeEvalCase({
      caseId: "authenticated_customer_state_read",
      stage: "crawl"
    });

    expect(realtimeCase.setup).toMatchObject({
      initial_session_state: {
        identity_status: "confirmed",
        resolved_customer_id: "cus_001"
      },
      server_context: expect.stringContaining("Server session context")
    });
    expect(realtimeCase.reward_basis).toContain("ACTION");
    expect(realtimeCase.expected.required_tools).toEqual([
      "get_customer_state"
    ]);
  });

  it("loads trusted date-resolution setup for date-changing Crawl probes", () => {
    const realtimeCase = loadRealtimeEvalCase({
      caseId: "authenticated_pause_date_changeset_proposal",
      stage: "crawl"
    });
    const setup = realtimeCase.setup?.initial_session_state;

    expect(setup).toMatchObject({
      identity_status: "confirmed",
      resolved_customer_id: "cus_001"
    });
    expect(setup?.trusted_date_resolutions).toHaveLength(1);
    expect(setup?.trusted_date_resolutions?.[0]).toMatchObject({
      actionable_service_dates: ["2026-05-18"],
      ambiguous: false,
      customer_id: "cus_001"
    });
    expect(realtimeCase.reward_basis).toContain("ACTION");
    expect(realtimeCase.expected.required_tools).toEqual([
      "create_change_set",
      "preview_change_set"
    ]);
  });

  it("derives Walk robustness cases from Crawl contracts", () => {
    const walkCase = loadRealtimeEvalCase({ caseId: "customer_identity_lookup", stage: "walk" });
    const ambiguousDateCase = loadRealtimeEvalCase({
      caseId: "authenticated_ambiguous_date_clarification",
      stage: "walk"
    });
    const allergyCase = loadRealtimeEvalCase({
      caseId: "authenticated_allergy_change_escalation",
      stage: "walk"
    });

    expect(walkCase).toMatchObject({
      audio: {
        walk_profile: {
          name: "walk_phone_noise_v1",
          seed: 1701
        }
      },
      case_id: "customer_identity_lookup",
      expected: {
        allowed_failed_tools: ["lookup_customer"],
        expected_final_state: { changed: false, customer_ids: [] },
        required_tools: ["lookup_customer"],
        response: { should_clarify_after_failed_tool: true }
      },
      input: {
        mode: "audio"
      },
      stage: "walk"
    });
    expect(walkCase.expected.notes).toContain("Walk robustness case");
    expect(walkCase.reward_basis).toEqual(
      REALTIME_WALK_DEGRADED_DEFAULT_REWARD_BASIS
    );
    expect(ambiguousDateCase.expected).toMatchObject({
      expected_final_state: { changed: false, customer_ids: [] },
      expected_policy_ids: [],
      required_tools: []
    });
    expect(allergyCase.expected).toMatchObject({
      allowed_failed_tools: [],
      expected_final_state: { changed: false, customer_ids: [] },
      expected_policy_ids: [],
      required_tools: [],
      response: {
        should_clarify_or_escalate: true,
        should_escalate: false,
        should_refuse_unsafe_action: true
      }
    });
  });

  it("derives Walk uncertainty contracts from profile overrides", () => {
    const realtimeCase = applyWalkProfileContract({
      realtimeCase: loadRealtimeEvalCase({ caseId: "customer_identity_lookup", stage: "walk" }),
      walkProfile: "walk_uncertain_noise_v1"
    });

    expect(realtimeCase.audio.walk_profile).toEqual({
      name: "walk_uncertain_noise_v1"
    });
    expect(realtimeCase.reward_basis).toEqual(
      REALTIME_WALK_DEGRADED_DEFAULT_REWARD_BASIS
    );
    expect(realtimeCase.reward_basis).not.toContain("ACTION");
    expect(realtimeCase.expected).toMatchObject({
      allowed_failed_tools: [],
      expected_final_state: { changed: false, customer_ids: [] },
      expected_policy_ids: [],
      required_tools: [],
      response: {
        should_avoid_guessed_identifier: true,
        should_avoid_operational_inference: true,
        should_clarify: true,
        should_request_clear_repetition: true,
        should_respond_in_english: true,
        should_stay_in_scope_on_unclear_audio: true
      }
    });
    expect(realtimeCase.expected.forbidden_tools).toContain("lookup_customer");
    expect(realtimeCase.expected.forbidden_tools).toContain("commit_change_set");
    expect(realtimeCase.expected.notes).toContain("Walk uncertainty case");
  });
});
