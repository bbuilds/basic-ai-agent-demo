import type { ModelLimits } from "../../types.ts";

export const DEFAULT_THRESHOLD = 0.8; // 80%

const MODEL_LIMITS: Record<string, ModelLimits> = {
	"gpt-5": {
		inputLimit: 272000,
		outputLimit: 128000,
		contextWindow: 400000,
	},
	"gpt-5-mini": {
		inputLimit: 272000,
		outputLimit: 128000,
		contextWindow: 400000,
	},
	"gpt-5-nano": {
		inputLimit: 272000,
		outputLimit: 128000,
		contextWindow: 400000,
	},
	"gpt-5.6-luna": {
		inputLimit: 922000,
		outputLimit: 128000,
		contextWindow: 1050000,
	},
	"gpt-5.6-terra": {
		inputLimit: 922000,
		outputLimit: 128000,
		contextWindow: 1050000,
	},
};

const DEFAULT_LIMITS: ModelLimits = {
	inputLimit: 128000,
	outputLimit: 16000,
	contextWindow: 128000,
};

export function getModelLimits(model: string): ModelLimits {
	if (MODEL_LIMITS[model]) {
		return MODEL_LIMITS[model];
	}

	if (model.startsWith("gpt-5.6")) {
		return MODEL_LIMITS["gpt-5.6-luna"];
	}

	if (model.startsWith("gpt-5")) {
		return MODEL_LIMITS["gpt-5"];
	}

	return DEFAULT_LIMITS;
}

export function isOverThreshold(
	totalTokens: number,
	inputLimit: number,
	threshold: number = DEFAULT_THRESHOLD,
): boolean {
	return totalTokens >= inputLimit * threshold;
}

export function calculateUsagePercentage(
	totalTokens: number,
	inputLimit: number,
): number {
	return (totalTokens / inputLimit) * 100;
}
