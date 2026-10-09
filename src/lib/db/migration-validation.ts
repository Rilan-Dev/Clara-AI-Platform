/**
 * Migration filenames are ordered by their numeric prefix. Duplicate prefixes
 * are unsafe because ordering between same-number migrations is accidental.
 * Keep this pure so the deployment and destructive-reset paths share one rule.
 */
export function findDuplicateMigrationNumbers(filenames: readonly string[]): string[] {
  const numbers = filenames.map((filename) => filename.split("_")[0]);
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const number of numbers) {
    if (seen.has(number)) duplicates.add(number);
    seen.add(number);
  }

  return [...duplicates].sort();
}
