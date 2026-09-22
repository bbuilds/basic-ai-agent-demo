import "./env.ts";

const fromEnv = (key: string, fallback: string): string =>
	process.env[key] || fallback;

export const AGENT_MODEL = fromEnv("AGENT_MODEL", "gpt-5.6-luna");
export const JUDGE_MODEL = fromEnv("JUDGE_MODEL", "gpt-5.6-terra");
export const LMNR_API_KEY = process.env.LMNR_API_KEY;

export const MAX_STEPS = 25;
