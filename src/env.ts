import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// The agent's own .env is the source of truth: it overrides shell variables,
// and the cwd's .env is never read, so running inside another project can't
// swap in that project's keys. `src/env.ts` and `dist/env.js` -> package root.
const packageRoot = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
);
dotenv.config({
	path: path.join(packageRoot, ".env"),
	override: true,
	quiet: true,
});
