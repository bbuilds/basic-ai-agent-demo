import type { ModelMessage } from "ai";

/**
 * Input data for single-turn tool selection evaluations.
 * Tests whether the LLM selects the correct tools without executing them.
 */
export interface EvalData {
	prompt: string;
	systemPrompt?: string;
	tools: string[];
	config?: {
		model?: string;
		temperature?: number;
	};
}

/**
 * Target expectations for single-turn evaluations
 */
export interface EvalTarget {
	expectedTools?: string[];
	/** Ordered subsequence the tool calls must follow. Order is checked, adjacency is not. */
	expectedToolOrder?: string[];
	forbiddenTools?: string[];
	category: "golden" | "secondary" | "negative";
}

/**
 * Result from single-turn executor
 */
export interface SingleTurnResult {
	toolCalls: Array<{ toolName: string; args: unknown }>;
	toolNames: string[];
	selectedAny: boolean;
}

/**
 * Mock tool configuration for multi-turn evaluations.
 * Tools return fixed values for deterministic testing.
 */
export interface MockToolConfig {
	/** Fixed value the tool returns. Its name must match a real tool; the schema and description come from src/agent/tools. */
	mockReturn: string;
}

/**
 * Input data for multi-turn agent evaluations.
 * Supports both fresh conversations and mid-conversation scenarios.
 */
export interface MultiTurnEvalData {
	prompt?: string;
	messages?: ModelMessage[];
	mockTools: Record<string, MockToolConfig>;
	config?: {
		model?: string;
		maxSteps?: number;
		temperature?: number;
	};
}

/**
 * Target expectations for multi-turn evaluations
 */
export interface MultiTurnTarget {
	originalTask: string;
	expectedToolOrder?: string[];
	forbiddenTools?: string[];
	mockToolResults: Record<string, string>;
	category: "task-completion" | "conversation-continuation" | "negative";
	rubric?: string;
}

/**
 * Result from multi-turn executor
 */
export interface MultiTurnResult {
	text: string;
	steps: Array<{
		toolCalls?: Array<{ toolCallId: string; toolName: string; args: unknown }>;
		toolResults?: Array<{
			toolCallId: string;
			toolName: string;
			result: unknown;
		}>;
		text?: string;
	}>;
	toolsUsed: string[];
	toolCallOrder: string[];
}

/**
 * Single entry in a single-turn evaluation dataset
 */
export interface SingleTurnDatasetEntry {
	data: EvalData;
	target: EvalTarget;
	metadata?: {
		description?: string;
	};
}

/**
 * Single entry in a multi-turn evaluation dataset
 */
export interface MultiTurnDatasetEntry {
	data: MultiTurnEvalData;
	target: MultiTurnTarget;
	metadata?: {
		description?: string;
	};
}
