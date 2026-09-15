import fs from "node:fs/promises";
import path from "node:path";
import { tool } from "ai";
import { z } from "zod";

const ROOT = process.cwd();

class PathEscapeError extends Error {}

function resolveSafe(inputPath: string): string {
  const resolved = path.resolve(ROOT, inputPath);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    throw new PathEscapeError(`Path escapes allowed directory: ${inputPath}`);
  }
  return resolved;
}

export const readFile = tool({
  description:
    "Read the contents of a file at the specified path. Use this to examine file contents.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to read"),
  }),
  execute: async ({ path: filePath }: { path: string }) => {
    try {
      const safePath = resolveSafe(filePath);
      const content = await fs.readFile(safePath, "utf-8");
      return content;
    } catch (error) {
      if (error instanceof PathEscapeError) {
        return `Error: ${error.message}`;
      }
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return `Error: File not found: ${filePath}`;
      }
      return `Error reading file: ${err.message}`;
    }
  },
});

export const writeFile = tool({
  description:
    "Write content to a file at the specified path. Creates the file if it doesn't exist, overwrites if it does.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to write"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({
    path: filePath,
    content,
  }: {
    path: string;
    content: string;
  }) => {
    try {
      const safePath = resolveSafe(filePath);
      const dir = path.dirname(safePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(safePath, content, "utf-8");
      return `Successfully wrote ${content.length} characters to ${filePath}`;
    } catch (error) {
      if (error instanceof PathEscapeError) {
        return `Error: ${error.message}`;
      }
      const err = error as NodeJS.ErrnoException;
      return `Error writing file: ${err.message}`;
    }
  },
});

export const listFiles = tool({
  description:
    "List all files and directories in the specified directory path.",
  inputSchema: z.object({
    directory: z
      .string()
      .describe("The directory path to list contents of")
      .default("."),
  }),
  execute: async ({ directory }: { directory: string }) => {
    try {
      const safeDir = resolveSafe(directory);
      const entries = await fs.readdir(safeDir, { withFileTypes: true });
      const items = entries.map((entry) => {
        const type = entry.isDirectory() ? "[dir]" : "[file]";
        return `${type} ${entry.name}`;
      });
      return items.length > 0
        ? items.join("\n")
        : `Directory ${directory} is empty`;
    } catch (error) {
      if (error instanceof PathEscapeError) {
        return `Error: ${error.message}`;
      }
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return `Error: Directory not found: ${directory}`;
      }
      return `Error listing directory: ${err.message}`;
    }
  },
});

export const deleteFile = tool({
  description:
    "Delete a file at the specified path. This is irreversible, so you must " +
    "pass confirm: true to actually perform the deletion. Omitting it or " +
    "passing false will not delete anything.",
  inputSchema: z.object({
    path: z.string().describe("The path to the file to delete"),
    confirm: z
      .boolean()
      .describe(
        "Must be explicitly set to true to perform the deletion. Acts as a safety check against accidental irreversible deletes.",
      ),
  }),
  execute: async ({
    path: filePath,
    confirm,
  }: {
    path: string;
    confirm: boolean;
  }) => {
    if (!confirm) {
      return `Deletion of ${filePath} was not performed: confirm must be set to true.`;
    }
    try {
      const safePath = resolveSafe(filePath);
      await fs.unlink(safePath);
      return `Successfully deleted ${filePath}`;
    } catch (error) {
      if (error instanceof PathEscapeError) {
        return `Error: ${error.message}`;
      }
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        return `Error: File not found: ${filePath}`;
      }
      return `Error deleting file: ${err.message}`;
    }
  },
});
