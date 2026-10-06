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
