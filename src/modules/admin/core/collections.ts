import { randomUUID } from "node:crypto";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "collection";
}

export function generateCollectionName(seed: string): string {
  const slug = slugify(seed);
  const suffix = randomUUID().slice(0, 8);
  return `${slug}_${suffix}`;
}
