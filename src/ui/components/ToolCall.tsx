import { Box, Text } from "ink";
import InkSpinner from "ink-spinner";
import { summarizeArgs, truncate } from "../format.ts";

export interface ToolCallProps {
	name: string;
	args?: unknown;
	status: "pending" | "complete";
	result?: string;
}

export function ToolCall({ name, args, status, result }: ToolCallProps) {
	const argSummary = summarizeArgs(args);

	return (
		<Box flexDirection="column" marginLeft={2}>
			<Box>
				<Text color="yellow">⚡ </Text>
				<Text color="yellow" bold>
					{name}
				</Text>
				{argSummary ? <Text dimColor>({argSummary})</Text> : null}
				{status === "pending" ? (
					<Text color="cyan">
						{" "}
						<InkSpinner type="dots" />
					</Text>
				) : (
					<Text color="green"> ✓</Text>
				)}
			</Box>
			{status === "complete" && result ? (
				<Box marginLeft={2}>
					<Text dimColor>→ {truncate(result, 120)}</Text>
				</Box>
			) : null}
		</Box>
	);
}
