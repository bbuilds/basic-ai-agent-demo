import { tool } from "ai";
import { z } from "zod";
import { DEFAULT_TIMEOUT_MS, runProcess } from "./exec.ts";

/**
 * Guardrail against an agent slip, NOT a security boundary. A determined or
 * creative command will get past a regex list; this only catches the
 * unambiguously destructive forms a model might emit by mistake.
 */
const DENYLIST: { pattern: RegExp; reason: string }[] = [
  {
    pattern:
      /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s+(-[a-zA-Z]*\s+)*(\/|~|\$HOME)\/?\*?(\s|$)/,
    reason: "recursive delete of the root or home directory",
  },
  { pattern: /\bmkfs(\.\w+)?\b/, reason: "formatting a filesystem" },
  {
    pattern: /\bdd\b[^|;&]*\bof=\/dev\//,
    reason: "writing directly to a device",
  },
  {
    pattern: /\b(shutdown|reboot|halt|poweroff)\b/,
    reason: "shutting down the machine",
  },
  {
    pattern: /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/,
    reason: "piping a remote script into a shell",
  },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "fork bomb" },
];

export function findDeniedReason(command: string): string | undefined {
  return DENYLIST.find(({ pattern }) => pattern.test(command))?.reason;
}

export const runCommand = tool({
  description: `Execute a shell command in the project directory and return its output. Use this for system operations, running scripts, or interacting with the operating system. Commands are non-interactive (no prompts or TTY, so pass flags like --yes and avoid editors), are killed after ${DEFAULT_TIMEOUT_MS / 1000}s, and long output is truncated in the middle.`,
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }: { command: string }) => {
    const deniedReason = findDeniedReason(command);
    if (deniedReason) {
      return `Error: refusing to run command (${deniedReason}): ${command}`;
    }

    return runProcess(command);
  },
});
