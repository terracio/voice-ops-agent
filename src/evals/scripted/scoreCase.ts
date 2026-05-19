import {
  EvalCaseResultSchema,
  EvalCaseSchema,
  type EvalCaseInput,
  type EvalCaseResult
} from "../caseSchema";
import { buildScriptedRewardAggregation } from "../shared/rewardAggregation";
import { runScriptedEvalScorers } from "./scorers";

export function scoreCase(
  evalCaseInput: EvalCaseInput,
  resultInput: EvalCaseResult
): EvalCaseResult {
  const evalCase = EvalCaseSchema.parse(evalCaseInput);
  const result = EvalCaseResultSchema.parse(resultInput);
  const scorerOutput = runScriptedEvalScorers(evalCase, result);
  const scores = [...result.scores, ...scorerOutput.scores];
  const diagnostics = [...result.diagnostics, ...scorerOutput.diagnostics];
  const aggregation = buildScriptedRewardAggregation({
    rewardBasis: evalCase.reward_basis,
    scores
  });

  return EvalCaseResultSchema.parse({
    ...result,
    reward_basis: evalCase.reward_basis,
    status:
      result.status === "passed" && !aggregation.reward_passed
        ? "failed"
        : result.status,
    scores,
    diagnostics
  });
}
