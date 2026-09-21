import { render, renderToString, Text } from "ink";
import { shutdownAgent } from "./agent/run.ts";
import { App } from "./ui/index.tsx";

process.stdout.write(
	`${renderToString(
		<Text>
			<Text bold color="magenta">
				🤖 AI Agent
			</Text>
			<Text dimColor> — type "exit" to quit</Text>
		</Text>,
	)}\n\n`,
);

const { waitUntilExit } = render(<App />, { incrementalRendering: true });

await waitUntilExit();
await shutdownAgent();
