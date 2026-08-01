export function localDateTimeToUtc(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return new Date(value).toISOString();
}
