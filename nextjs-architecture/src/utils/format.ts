export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatRelativeTime(value: string) {
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const delta = new Date(value).getTime() - Date.now();
  const seconds = Math.round(delta / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  for (const [unit, step] of units) {
    if (Math.abs(seconds) >= step) {
      return formatter.format(Math.round(seconds / step), unit);
    }
  }

  return formatter.format(seconds, "second");
}

export function sentenceCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
