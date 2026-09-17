import type { ModelMessage } from "ai";
import { Box, useApp } from "ink";
import { useCallback, useRef, useState } from "react";
import { runAgent } from "../agent/run.ts";
import type { TokenUsageInfo } from "../types.ts";
import { Input } from "./components/Input.tsx";
import {
  Message,
  MessageList,
  type TranscriptItem,
} from "./components/MessageList.tsx";
import { Spinner } from "./components/Spinner.tsx";
import { TokenUsage } from "./components/TokenUsage.tsx";
import { ToolCall, type ToolCallProps } from "./components/ToolCall.tsx";

interface ActiveToolCall extends ToolCallProps {
  id: string;
}

const EXIT_COMMANDS = new Set(["exit", "quit"]);

let idCounter = 0;
const createId = (prefix: string) => `${prefix}-${idCounter++}`;

export function App() {
  const { exit } = useApp();
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const [history, setHistory] = useState<ModelMessage[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageInfo | null>(null);

  // Refs are the source of truth inside agent callbacks; state mirrors them for rendering.
  const streamBuffer = useRef("");
  const activeRef = useRef<ActiveToolCall[]>([]);

  const commit = useCallback((item: TranscriptItem) => {
    setTranscript((prev) => [...prev, item]);
  }, []);

  const syncActive = useCallback(() => {
    setActiveToolCalls([...activeRef.current]);
  }, []);

  /** Move whatever has streamed so far out of the live region and into the transcript. */
  const flushStream = useCallback(() => {
    const text = streamBuffer.current.trim();
    streamBuffer.current = "";
    setStreamingText("");
    if (text) {
      commit({
        id: createId("msg"),
        kind: "message",
        role: "assistant",
        content: text,
      });
    }
  }, [commit]);

  const handleSubmit = useCallback(
    async (userInput: string) => {
      if (EXIT_COMMANDS.has(userInput.toLowerCase())) {
        exit();
        return;
      }

      commit({
        id: createId("msg"),
        kind: "message",
        role: "user",
        content: userInput,
      });
      setIsBusy(true);
      streamBuffer.current = "";
      setStreamingText("");
      activeRef.current = [];
      syncActive();

      try {
        const nextHistory = await runAgent(userInput, history, {
          onToken: (token) => {
            streamBuffer.current += token;
            setStreamingText(streamBuffer.current);
          },
          onToolCallStart: (name, args) => {
            // Text streamed before this call belongs above it in the transcript.
            flushStream();
            activeRef.current.push({
              id: createId("tool"),
              name,
              args,
              status: "pending",
            });
            syncActive();
          },
          onToolCallEnd: (name, result) => {
            const index = activeRef.current.findIndex((tc) => tc.name === name);
            if (index === -1) return;
            const [finished] = activeRef.current.splice(index, 1);
            syncActive();
            commit({
              id: finished.id,
              kind: "tool",
              name: finished.name,
              args: finished.args,
              result,
            });
          },
          onComplete: () => {
            // Ignore the accumulated response: anything before a tool call is already committed.
            flushStream();
            activeRef.current = [];
            syncActive();
          },
          onTokenUsage: setTokenUsage,
        });

        setHistory(nextHistory);
      } catch (error) {
        flushStream();
        commit({
          id: createId("msg"),
          kind: "message",
          role: "error",
          content: error instanceof Error ? error.message : String(error),
        });
      } finally {
        activeRef.current = [];
        syncActive();
        setIsBusy(false);
      }
    },
    [commit, exit, flushStream, history, syncActive],
  );

  const showSpinner = isBusy && !streamingText && activeToolCalls.length === 0;

  return (
    <Box flexDirection="column">
      <MessageList items={transcript} />

      <Box flexDirection="column" paddingX={1}>
        {streamingText ? (
          // biome-ignore lint/a11y/useValidAriaRole: `role` here is Message's own MessageRole prop, not an ARIA role (Ink has no DOM/ARIA).
          <Message role="assistant" content={streamingText} />
        ) : null}

        {activeToolCalls.map((tc) => (
          <ToolCall
            key={tc.id}
            name={tc.name}
            args={tc.args}
            status={tc.status}
            result={tc.result}
          />
        ))}

        {showSpinner ? (
          <Box marginTop={1}>
            <Spinner />
          </Box>
        ) : null}

        <Box marginTop={1}>
          <Input onSubmit={handleSubmit} isBusy={isBusy} />
        </Box>

        <Box marginTop={1}>
          <TokenUsage usage={tokenUsage} />
        </Box>
      </Box>
    </Box>
  );
}
