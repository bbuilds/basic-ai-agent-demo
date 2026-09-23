export interface TokenUsageInfo {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	inputLimit: number;
	threshold: number;
	percentage: number;
}

export type ApprovalDecision = "once" | "always" | "reject";

export interface AgentCallbacks {
	onToken: (token: string) => void;
	onToolCallStart: (toolCallId: string, name: string, args: unknown) => void;
	onToolCallEnd: (toolCallId: string, name: string, result: string) => void;
	onComplete: (response: string) => void;
	onToolApproval?: (call: ToolCallInfo) => Promise<ApprovalDecision>;
	onTokenUsage?: (usage: TokenUsageInfo) => void;
}

export interface ToolCallInfo {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

export interface ModelLimits {
	inputLimit: number;
	outputLimit: number;
	contextWindow: number;
}
