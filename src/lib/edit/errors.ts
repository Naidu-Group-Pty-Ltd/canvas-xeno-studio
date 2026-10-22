/** True when an error means a table hasn't been created yet (a pending migration). */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === "42P01" ||
    record.code === "PGRST205" ||
    (typeof record.message === "string" && /schema cache|does not exist/i.test(record.message))
  );
}

/** True when an error means a column hasn't been added yet (a pending migration). */
export function isMissingColumnError(error: unknown, column: string): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return (
    (record.code === "42703" ||
      record.code === "PGRST204" ||
      /column .* does not exist|could not find the .* column/i.test(message)) &&
    message.includes(column)
  );
}
