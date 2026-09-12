import { openai } from "@ai-sdk/openai";
import { Laminar, LaminarAiSdkTelemetry } from "@lmnr-ai/lmnr";
import { type ModelMessage, registerTelemetry, streamText } from "ai";
import "dotenv/config";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";
import { executeTool } from "./executeTool.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";

import { modelTools } from "./tools/index.ts";

const MODEL_NAME = process.env.AGENT_MODEL ?? "gpt-5.6-luna";

Laminar.initialize({ projectApiKey: process.env.LMNR_API_KEY });
registerTelemetry(new LaminarAiSdkTelemetry());

export async function shutdownAgent(): Promise<void> {
  await Laminar.shutdown();
}

export async function runAgent(
  userMessage: string,
  conversationHistory: ModelMessage[],
  callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
  const workingHistory = filterCompatibleMessages(conversationHistory);
  const messages: ModelMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...workingHistory,
    { role: "user", content: userMessage },
  ];
  //entire response outside the loop
  let fullResponse = "";

  while (true) {
    const result = streamText({
      model: openai(MODEL_NAME),
      messages,
      tools: modelTools,
      allowSystemInMessages: true,
    });

    const toolCalls: ToolCallInfo[] = [];
    let currentText = "";
    let streamError: Error | null = null;

    try {
      for await (const chunk of result.stream) {
        if (chunk.type === "text-delta") {
          currentText += chunk.text;
          callbacks.onToken(chunk.text);
        }
        if (chunk.type === "tool-call") {
          const input = chunk.input as Record<string, unknown>;
          toolCalls.push({
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            args: input,
          });
          callbacks.onToolCallStart(chunk.toolName, input);
        }
      }
    } catch (error) {
      streamError = error as Error;
      if (
        !currentText &&
        !streamError.message.includes("No output generated")
      ) {
        throw streamError;
      }
    }
    fullResponse += currentText;

    if (streamError && !currentText) {
      fullResponse =
        "I apologize, but I wasn't able to generate a response. The system is down";
      callbacks.onToken(fullResponse);
      messages.push({ role: "assistant", content: fullResponse });
      break;
    }

    //finished reason
    const finishReason = await result.finishReason;
    const responseMessages = await result.responseMessages;
    messages.push(...responseMessages);

    if (finishReason !== "tool-calls" || toolCalls.length === 0) {
      break;
    }

    for (const tc of toolCalls) {
      const toolResult = await executeTool(tc.toolName, tc.args);
      callbacks.onToolCallEnd(tc.toolName, toolResult);

      messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output: { type: "text", value: toolResult },
          },
        ],
      });
    }
  }

  callbacks.onComplete(fullResponse);
  const [, ...history] = messages;
  return history;
}
