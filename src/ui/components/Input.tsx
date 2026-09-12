import { Box, Text, useInput, usePaste } from "ink";
import { useState } from "react";

interface InputProps {
  onSubmit: (value: string) => void;
  isBusy?: boolean;
}

export function Input({ onSubmit, isBusy = false }: InputProps) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);

  const insert = (text: string) => {
    setValue((prev) => prev.slice(0, cursor) + text + prev.slice(cursor));
    setCursor((prev) => prev + text.length);
  };

  usePaste((text) => insert(text.replace(/\s+/g, " ")));

  useInput((input, key) => {
    if (key.return) {
      const trimmed = value.trim();
      if (!trimmed || isBusy) return;
      setValue("");
      setCursor(0);
      onSubmit(trimmed);
      return;
    }

    if (key.leftArrow) return setCursor((c) => Math.max(0, c - 1));
    if (key.rightArrow) return setCursor((c) => Math.min(value.length, c + 1));
    if (key.home) return setCursor(0);
    if (key.end) return setCursor(value.length);

    if (key.backspace) {
      if (cursor === 0) return;
      setValue((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
      setCursor((c) => c - 1);
      return;
    }

    if (key.delete) {
      setValue((prev) => prev.slice(0, cursor) + prev.slice(cursor + 1));
      return;
    }

    if (key.ctrl && input === "u") {
      setValue("");
      setCursor(0);
      return;
    }

    if (key.ctrl && input === "w") {
      const head = value.slice(0, cursor).replace(/\s*\S*$/, "");
      setValue(head + value.slice(cursor));
      setCursor(head.length);
      return;
    }

    if (input && !key.ctrl && !key.meta) insert(input);
  });

  const before = value.slice(0, cursor);
  const atCursor = value.slice(cursor, cursor + 1) || " ";
  const after = value.slice(cursor + 1);

  return (
    <Box>
      <Text color={isBusy ? "gray" : "blue"} bold>
        {"> "}
      </Text>
      <Text>
        {before}
        <Text inverse={!isBusy}>{atCursor}</Text>
        {after}
      </Text>
    </Box>
  );
}
