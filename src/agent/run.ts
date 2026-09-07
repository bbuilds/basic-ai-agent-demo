import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import { generateText, type ModelMessage } from "ai";
import type { AgentCallbacks } from "../types.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";

const MODEL_NAME = "gpt-5.6-luna";

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
  // biome-ignore lint/suspicious/noExplicitAny: @TODO remove after testing
): Promise<any> {
  const { text } = await generateText({
    model: openai(MODEL_NAME),
    prompt: userMessage,
    system: SYSTEM_PROMPT,
  });

  console.log(text);
}

runAgent("Hello, are you there?");
