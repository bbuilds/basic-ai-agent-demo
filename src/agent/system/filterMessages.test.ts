import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelMessage } from "ai";
import { filterCompatibleMessages } from "./filterMessages.ts";

const toolCallAssistant = (toolCallId: string): ModelMessage => ({
  role: "assistant",
  content: [
    { type: "tool-call", toolCallId, toolName: "getDateTime", input: {} },
  ],
});

const toolResult = (toolCallId: string): ModelMessage => ({
  role: "tool",
  content: [
    {
      type: "tool-result",
      toolCallId,
      toolName: "getDateTime",
      output: { type: "text", value: "2026-09-12T00:00:00.000Z" },
    },
  ],
});

test("keeps a full tool round-trip", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "what time is it?" },
    toolCallAssistant("call_1"),
    toolResult("call_1"),
    { role: "assistant", content: [{ type: "text", text: "It is noon." }] },
  ];

  assert.deepEqual(filterCompatibleMessages(messages), messages);
});

test("drops a tool result with no matching tool call", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "what time is it?" },
    toolResult("orphan_1"),
    { role: "assistant", content: [{ type: "text", text: "It is noon." }] },
  ];

  const filtered = filterCompatibleMessages(messages);

  assert.equal(filtered.length, 2);
  assert.ok(!filtered.some((msg) => msg.role === "tool"));
});

test("drops a tool result whose assistant message was itself dropped", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "hi" },
    // empty assistant content -> dropped, so its result is orphaned
    { role: "assistant", content: [] },
    toolResult("call_1"),
  ];

  assert.deepEqual(filterCompatibleMessages(messages), [messages[0]]);
});

test("still drops empty assistant messages", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "text", text: "   " }] },
  ];

  assert.deepEqual(filterCompatibleMessages(messages), [messages[0]]);
});
