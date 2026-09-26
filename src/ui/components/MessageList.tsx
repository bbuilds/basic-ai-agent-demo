import { Box, Static, Text } from "ink";
import { ToolCall } from "./ToolCall.tsx";

export type MessageRole = "user" | "assistant" | "error";

export type TranscriptItem =
	| { id: string; kind: "message"; role: MessageRole; content: string }
	| {
			id: string;
			kind: "tool";
			name: string;
			args?: unknown;
			result?: string;
			rejected?: boolean;
	  };

const ROLE_STYLES: Record<MessageRole, { label: string; color: string }> = {
	user: { label: "› You", color: "blue" },
	assistant: { label: "› Assistant", color: "green" },
	error: { label: "› Error", color: "red" },
};

interface MessageProps {
	role: MessageRole;
	content: string;
}

/** One labelled block of text. Also used for the live streaming response in `App`. */
export function Message({ role, content }: MessageProps) {
	const { label, color } = ROLE_STYLES[role];

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text color={color} bold>
				{label}
			</Text>
			<Box marginLeft={2}>
				<Text>{content}</Text>
			</Box>
		</Box>
	);
}

interface MessageListProps {
	items: TranscriptItem[];
}

export function MessageList({ items }: MessageListProps) {
	return (
		<Static items={items}>
			{(item) =>
				item.kind === "message" ? (
					<Message key={item.id} role={item.role} content={item.content} />
				) : (
					<Box key={item.id} marginBottom={1}>
						<ToolCall
							name={item.name}
							args={item.args}
							status={item.rejected ? "rejected" : "complete"}
							result={item.result}
						/>
					</Box>
				)
			}
		</Static>
	);
}
