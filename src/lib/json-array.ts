/**
 * JSON array helpers for SQLite compatibility.
 *
 * SQLite does not support native array columns. Fields that would be String[]
 * in PostgreSQL are stored as JSON-encoded strings in SQLite.
 * Use these helpers to parse and stringify array values.
 */

/** Parse a JSON string column into a string array. Returns [] on invalid input. */
export function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/** Stringify a string array for storage in a JSON string column. */
export function stringifyJsonArray(values: string[]): string {
  return JSON.stringify(values);
}
