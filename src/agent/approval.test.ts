import assert from "node:assert/strict";
import { test } from "node:test";
import { allowsAlways, isSensitivePath, requiresApproval } from "./approval.ts";

test("requiresApproval never gates read-only tools", () => {
	assert.equal(requiresApproval("getDateTime", {}), false);
	assert.equal(requiresApproval("listFiles", { directory: ".ssh" }), false);
	assert.equal(
		requiresApproval("searchFiles", { pattern: "KEY", path: ".env" }),
		false,
	);
	assert.equal(requiresApproval("webSearch", { query: "anything" }), false);
});

test("requiresApproval always gates destructive tools", () => {
	for (const name of ["writeFile", "deleteFile", "runCommand", "executeCode"]) {
		assert.equal(requiresApproval(name, {}), true, name);
	}
});

test("requiresApproval gates readFile only on sensitive paths", () => {
	for (const path of ["src/index.ts", "README.md", "package.json"]) {
		assert.equal(requiresApproval("readFile", { path }), false, path);
	}
	for (const path of [
		".env",
		"config/.env.local",
		"certs/server.pem",
		".ssh/id_rsa",
		".aws/credentials",
	]) {
		assert.equal(requiresApproval("readFile", { path }), true, path);
	}
});

test("isSensitivePath does not match innocuous lookalikes", () => {
	for (const path of [
		"src/environment.ts",
		"src/monkey.ts",
		"docs/keyboard.md",
		"src/certificate-display.tsx",
	]) {
		assert.equal(isSensitivePath(path), false, path);
	}
});

test("isSensitivePath rejects non-strings and empty values", () => {
	for (const value of [undefined, null, 42, {}, [], ""]) {
		assert.equal(isSensitivePath(value), false, String(value));
	}
	assert.equal(requiresApproval("readFile", {}), false);
});

test("requiresApproval fails closed on unknown tools", () => {
	assert.equal(requiresApproval("rmRf", {}), true);
	assert.equal(requiresApproval("", {}), true);
});

test("allowsAlways is false for arbitrary-execution tools", () => {
	assert.equal(allowsAlways("runCommand"), false);
	assert.equal(allowsAlways("executeCode"), false);
	assert.equal(allowsAlways("writeFile"), true);
	assert.equal(allowsAlways("deleteFile"), true);
	assert.equal(allowsAlways("readFile"), true);
});
