import type { ToolName } from "./executeTool.ts";

const SENSITIVE_PATH_PATTERNS: readonly RegExp[] = [
	/(^|[\\/])\.env($|[.\\/])/i,
	/\.(pem|key|p12|pfx|crt|cer|keystore|jks)$/i,
	/(^|[\\/])id_(rsa|dsa|ecdsa|ed25519)/i,
	/(^|[\\/])\.ssh[\\/]/i,
	/(^|[\\/])\.aws[\\/]/i,
	/(^|[\\/])\.gnupg[\\/]/i,
	/(^|[\\/])\.npmrc$/i,
	/(^|[\\/])\.netrc$/i,
	/(^|[\\/])\.git-credentials$/i,
	/credential/i,
	/secret/i,
];

export function isSensitivePath(value: unknown): boolean {
	if (typeof value !== "string" || value.length === 0) return false;
	return SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

type ApprovalRule = boolean | ((args: Record<string, unknown>) => boolean);

const TOOL_APPROVAL: Record<ToolName, ApprovalRule> = {
	getDateTime: false,
	listFiles: false,
	searchFiles: false,
	webSearch: false,
	readFile: (args) => isSensitivePath(args.path),
	writeFile: true,
	deleteFile: true,
	runCommand: true,
	executeCode: true,
};

export function requiresApproval(
	toolName: string,
	args: Record<string, unknown>,
): boolean {
	const rule = TOOL_APPROVAL[toolName as ToolName];
	if (rule === undefined) return true;
	return typeof rule === "function" ? rule(args) : rule;
}

export function allowsAlways(toolName: string): boolean {
	return toolName !== "runCommand" && toolName !== "executeCode";
}
