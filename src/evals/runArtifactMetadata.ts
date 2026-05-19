import { execFileSync } from "node:child_process";

export const RUN_ARTIFACT_SCHEMA_VERSION = "eval_run_artifacts.v1";

export type EvalRunGitMetadata = {
  branch?: string;
  commit?: string;
  is_dirty: boolean;
};

export type EvalRunArtifactManifest = {
  schema_version: typeof RUN_ARTIFACT_SCHEMA_VERSION;
  run_id: string;
  suite: "realtime" | "scripted";
  artifacts: Record<string, string>;
  git?: EvalRunGitMetadata;
  invoked_command?: string;
  mode?: string;
  model?: string;
  stage?: string;
};

export function buildRunArtifactManifest(options: {
  artifacts: Record<string, string>;
  git?: EvalRunGitMetadata;
  invokedCommand?: string;
  mode?: string;
  model?: string;
  runId: string;
  stage?: string;
  suite: EvalRunArtifactManifest["suite"];
}): EvalRunArtifactManifest {
  return {
    schema_version: RUN_ARTIFACT_SCHEMA_VERSION,
    run_id: options.runId,
    suite: options.suite,
    ...(options.stage ? { stage: options.stage } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.git ? { git: options.git } : {}),
    ...(options.invokedCommand ? { invoked_command: options.invokedCommand } : {}),
    artifacts: options.artifacts
  };
}

export function collectGitMetadata(cwd = process.cwd()): EvalRunGitMetadata | undefined {
  const commit = runGit(["rev-parse", "HEAD"], cwd);
  if (!commit) return undefined;

  const branch = runGit(["branch", "--show-current"], cwd);
  const status = runGit(["status", "--short"], cwd);

  return {
    ...(branch ? { branch } : {}),
    commit,
    is_dirty: Boolean(status)
  };
}

export function resolveInvokedCommand(
  env: Record<string, string | undefined> = process.env,
  argv = process.argv
): string | undefined {
  const lifecycle = env.npm_lifecycle_event;
  const rawArgs = argv.slice(2);
  const scriptArgs = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const args = sanitizeCommandArgs(scriptArgs).map(shellQuote);

  if (lifecycle) {
    return ["pnpm", lifecycle, ...(args.length > 0 ? ["--", ...args] : [])]
      .join(" ");
  }

  const command = sanitizeCommandArgs(argv).map(shellQuote).join(" ");
  return command || undefined;
}

export function safeArtifactSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function runGit(args: string[], cwd: string): string | undefined {
  try {
    const output = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();

    return output || undefined;
  } catch {
    return undefined;
  }
}

function sanitizeCommandArgs(args: string[]): string[] {
  const sensitiveFlags = new Set([
    "--api-key",
    "--input-text",
    "--openai-api-key"
  ]);
  const sanitized: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] as string;
    const sensitiveInlineFlag = [...sensitiveFlags].find((flag) =>
      arg.startsWith(`${flag}=`)
    );

    if (sensitiveInlineFlag) {
      sanitized.push(`${sensitiveInlineFlag}=[redacted]`);
      continue;
    }

    if (sensitiveFlags.has(arg)) {
      sanitized.push(arg, "[redacted]");
      index += 1;
      continue;
    }

    sanitized.push(arg);
  }

  return sanitized;
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:@=-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
