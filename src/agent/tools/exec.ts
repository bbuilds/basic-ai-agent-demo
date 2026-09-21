import shell from "shelljs";

export const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_MAX_OUTPUT_CHARS = 30_000;

const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export const REDACTED = "<redacted-by-agent>";

const MASKED_ENV_KEYS = ["OPENAI_API_KEY", "LMNR_API_KEY"];

export interface RunProcessOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

export function truncateOutput(
  output: string,
  maxChars: number = DEFAULT_MAX_OUTPUT_CHARS,
): string {
  if (output.length <= maxChars) {
    return output;
  }

  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = maxChars - headChars;
  const omitted = output.length - maxChars;

  return [
    output.slice(0, headChars),
    `\n\n... [truncated ${omitted} characters] ...\n\n`,
    output.slice(output.length - tailChars),
  ].join("");
}

function buildChildEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  for (const key of MASKED_ENV_KEYS) {
    if (key in env) {
      env[key] = REDACTED;
    }
  }

  return env;
}

function formatOutput(stdout: string, stderr: string): string {
  const sections: string[] = [];

  if (stdout) {
    sections.push(stdout);
  }
  if (stderr) {
    sections.push(`--- stderr ---\n${stderr}`);
  }

  return sections.join("\n");
}

/**
 * Run a shell command without blocking the event loop.
 *
 * shelljs's `exec` is synchronous unless `async: true` is passed, and a sync
 * exec freezes the Ink UI and the streaming loop for the whole command. This
 * helper always uses the async form, always applies a timeout, and always
 * resolves with a string — it never rejects, so callers stay simple.
 */
export async function runProcess(
  command: string,
  options: RunProcessOptions = {},
): Promise<string> {
  const {
    cwd = process.cwd(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputChars = DEFAULT_MAX_OUTPUT_CHARS,
  } = options;

  const startedAt = Date.now();

  const result = await new Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    try {
      shell.exec(
        command,
        {
          silent: true,
          async: true,
          timeout: timeoutMs,
          maxBuffer: MAX_BUFFER_BYTES,
          cwd,
          env: buildChildEnv(),
        },
        (code, stdout, stderr) => {
          resolve({ code, stdout: stdout ?? "", stderr: stderr ?? "" });
        },
      );
    } catch (error) {
      const err = error as Error;
      resolve({ code: 1, stdout: "", stderr: err.message });
    }
  });

  const output = truncateOutput(
    formatOutput(result.stdout, result.stderr),
    maxOutputChars,
  );

  const timedOut = result.code !== 0 && Date.now() - startedAt >= timeoutMs;
  if (timedOut) {
    const seconds = timeoutMs / 1000;
    return `Command timed out after ${seconds}s and was killed.${
      output ? `\n${output}` : ""
    }`;
  }

  if (result.code !== 0) {
    return `Command failed (exit code ${result.code}):\n${output}`;
  }

  return output || "Command completed successfully (no output)";
}
