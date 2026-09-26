import { Box, Text, useInput } from "ink";
import type { ApprovalDecision } from "../../types.ts";
import { truncate } from "../format.ts";

interface ApprovalPromptProps {
	toolName: string;
	args?: unknown;
	allowAlways: boolean;
	onDecision: (decision: ApprovalDecision) => void;
}

const ARG_MAX_LENGTH = 300;

function argLines(args: unknown): Array<[string, string]> {
	if (!args || typeof args !== "object") return [];
	return Object.entries(args as Record<string, unknown>).map(([key, value]) => [
		key,
		truncate(
			typeof value === "string" ? value : JSON.stringify(value),
			ARG_MAX_LENGTH,
		),
	]);
}

export function ApprovalPrompt({
	toolName,
	args,
	allowAlways,
	onDecision,
}: ApprovalPromptProps) {
	useInput((input, key) => {
		if (key.escape) {
			onDecision("reject");
			return;
		}
		if (key.ctrl || key.meta) return;
		if (input.length !== 1) return;

		const answer = input.toLowerCase();
		if (answer === "y") onDecision("once");
		else if (answer === "n") onDecision("reject");
		else if (answer === "a" && allowAlways) onDecision("always");
	});

	return (
		<Box
			flexDirection="column"
			marginLeft={2}
			marginTop={1}
			borderStyle="round"
			borderColor="yellow"
			paddingX={1}
		>
			<Box>
				<Text color="yellow">⚡ </Text>
				<Text color="yellow" bold>
					{toolName}
				</Text>
				<Text dimColor> wants to run</Text>
			</Box>

			{argLines(args).map(([key, value]) => (
				<Box key={key} marginLeft={2}>
					<Text dimColor>{key}: </Text>
					<Text>{value}</Text>
				</Box>
			))}

			<Box marginTop={1}>
				<Text bold>Allow? </Text>
				<Text color="green">y</Text>
				<Text dimColor> once · </Text>
				{allowAlways ? (
					<>
						<Text color="cyan">a</Text>
						<Text dimColor> always this session · </Text>
					</>
				) : null}
				<Text color="red">n</Text>
				<Text dimColor> reject (esc)</Text>
			</Box>
		</Box>
	);
}
