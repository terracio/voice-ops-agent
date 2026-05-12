import {
  EvalCaseResultSchema,
  EvalCaseSchema,
  type EvalCase,
  type EvalCaseResult
} from "./caseSchema";
import { runEvalScorers } from "./scorers";

export function scoreCase(
  evalCaseInput: EvalCase,
  resultInput: EvalCaseResult
): EvalCaseResult {
  const evalCase = EvalCaseSchema.parse(evalCaseInput);
  const result = EvalCaseResultSchema.parse(resultInput);
  const scorerOutput = runEvalScorers(evalCase, result);
  const scores = [...result.scores, ...scorerOutput.scores];
  const diagnostics = [...result.diagnostics, ...scorerOutput.diagnostics];
  const failed = scores.some((score) => !score.passed);

  return EvalCaseResultSchema.parse({
    ...result,
    status: result.status === "passed" && failed ? "failed" : result.status,
    scores,
    diagnostics
  });
}
