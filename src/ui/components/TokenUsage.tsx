import { Box, Text } from "ink";
import type { TokenUsageInfo } from "../../types.ts";

interface TokenUsageProps {
  usage: TokenUsageInfo | null;
}

const BAR_WIDTH = 20;

export function TokenUsage({ usage }: TokenUsageProps) {
  if (!usage) return null;

  const thresholdPercent = Math.round(usage.threshold * 100);
  const clampedPercent = Math.min(100, Math.max(0, usage.percentage));
  const filled = Math.round((clampedPercent / 100) * BAR_WIDTH);

  let color: "green" | "yellow" | "red" = "green";
  if (usage.percentage >= usage.threshold * 100) {
    color = "red";
  } else if (usage.percentage >= usage.threshold * 100 * 0.75) {
    color = "yellow";
  }

  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text>
        <Text color={color}>{"█".repeat(filled)}</Text>
        <Text dimColor>{"░".repeat(BAR_WIDTH - filled)}</Text>
        {" "}
        <Text color={color} bold>
          {clampedPercent.toFixed(1)}%
        </Text>
        <Text dimColor>
          {" "}
          ({usage.totalTokens.toLocaleString()} /{" "}
          {usage.contextWindow.toLocaleString()} tokens, threshold{" "}
          {thresholdPercent}%)
        </Text>
      </Text>
    </Box>
  );
}
