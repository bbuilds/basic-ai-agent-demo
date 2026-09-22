#!/usr/bin/env node
import { Laminar, LaminarAiSdkTelemetry } from "@lmnr-ai/lmnr";
import { registerTelemetry } from "ai";
import { render, renderToString, Text } from "ink";
import { LMNR_API_KEY } from "./config.ts";
import { App } from "./ui/index.tsx";

Laminar.initialize({ projectApiKey: LMNR_API_KEY });
registerTelemetry(new LaminarAiSdkTelemetry());

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
await Laminar.shutdown();
