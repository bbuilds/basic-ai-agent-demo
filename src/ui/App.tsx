import type { ModelMessage } from "ai";
import { Box, useApp } from "ink";
import { useCallback, useRef, useState } from "react";
import { allowsAlways } from "../agent/approval.ts";
import { runAgent } from "../agent/run.ts";
import type {
	ApprovalDecision,
	TokenUsageInfo,
	ToolCallInfo,
} from "../types.ts";
import { ApprovalPrompt } from "./components/ApprovalPrompt.tsx";
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
	const [pendingApproval, setPendingApproval] = useState<ToolCallInfo | null>(
		null,
	);

	// Refs are the source of truth inside agent callbacks; state mirrors them for rendering.
	const streamBuffer = useRef("");
	const activeRef = useRef<ActiveToolCall[]>([]);
	const approvalResolver = useRef<((d: ApprovalDecision) => void) | null>(null);
	const alwaysAllowed = useRef<Set<string>>(new Set());
	const rejectedIds = useRef<Set<string>>(new Set());

	const resolveApproval = useCallback((decision: ApprovalDecision) => {
		const resolve = approvalResolver.current;
		approvalResolver.current = null;
		setPendingApproval(null);
		resolve?.(decision);
	}, []);

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
					onToolCallStart: (toolCallId, name, args) => {
						// Text streamed before this call belongs above it in the transcript.
						flushStream();
						activeRef.current.push({
							id: toolCallId,
							name,
							args,
							status: "pending",
						});
						syncActive();
					},
					onToolCallEnd: (toolCallId, _name, result) => {
						const index = activeRef.current.findIndex(
							(tc) => tc.id === toolCallId,
						);
						if (index === -1) return;
						const [finished] = activeRef.current.splice(index, 1);
						syncActive();
						commit({
							id: finished.id,
							kind: "tool",
							name: finished.name,
							args: finished.args,
							result,
							rejected: rejectedIds.current.delete(toolCallId),
						});
					},
					onToolApproval: (call) =>
						new Promise<ApprovalDecision>((resolve) => {
							if (alwaysAllowed.current.has(call.toolName)) {
								resolve("once");
								return;
							}
							approvalResolver.current = (decision) => {
								if (decision === "always") {
									alwaysAllowed.current.add(call.toolName);
								}
								if (decision === "reject") {
									for (const tc of activeRef.current) {
										rejectedIds.current.add(tc.id);
									}
								}
								resolve(decision);
							};
							setPendingApproval(call);
						}),
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
				approvalResolver.current = null;
				setPendingApproval(null);
				rejectedIds.current.clear();
				activeRef.current = [];
				syncActive();
				setIsBusy(false);
			}
		},
		[commit, exit, flushStream, history, syncActive],
	);

	const showSpinner =
		isBusy &&
		!streamingText &&
		activeToolCalls.length === 0 &&
		!pendingApproval;

	return (
		<Box flexDirection="column">
			<MessageList items={transcript} />

			<Box flexDirection="column" paddingX={1}>
				{streamingText ? (
					// biome-ignore lint/a11y/useValidAriaRole: `role` here is Message's own MessageRole prop, not an ARIA role (Ink has no DOM/ARIA).
					<Message role="assistant" content={streamingText} />
				) : null}

				{activeToolCalls
					.filter((tc) => tc.id !== pendingApproval?.toolCallId)
					.map((tc) => (
						<ToolCall
							key={tc.id}
							name={tc.name}
							args={tc.args}
							status={tc.status}
							result={tc.result}
						/>
					))}

				{pendingApproval ? (
					<ApprovalPrompt
						key={pendingApproval.toolCallId}
						toolName={pendingApproval.toolName}
						args={pendingApproval.args}
						allowAlways={allowsAlways(pendingApproval.toolName)}
						onDecision={resolveApproval}
					/>
				) : null}

				{showSpinner ? (
					<Box marginTop={1}>
						<Spinner />
					</Box>
				) : null}

				<Box marginTop={1}>
					<Input
						onSubmit={handleSubmit}
						isBusy={isBusy}
						isActive={!pendingApproval}
					/>
				</Box>

				<Box marginTop={1}>
					<TokenUsage usage={tokenUsage} />
				</Box>
			</Box>
		</Box>
	);
}
