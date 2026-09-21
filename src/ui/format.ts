const MAX_SUMMARY_LENGTH = 60;

export function truncate(value: string, max = MAX_SUMMARY_LENGTH): string {
	const flat = value.replace(/\s+/g, " ").trim();
	return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function summarizeArgs(args: unknown): string {
	if (!args || typeof args !== "object") return "";

	const entries = Object.entries(args as Record<string, unknown>);
	if (entries.length === 0) return "";

	return truncate(
		entries
			.map(
				([key, value]) =>
					`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`,
			)
			.join(", "),
	);
}
