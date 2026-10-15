// scripts/export-qdrant.mjs
// Clara AI - Interactive Qdrant JSON Exporter
// Requires Node.js 20+; uses built-in modules only.

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import { mkdir, open, rename, stat, unlink } from "node:fs/promises";

const DEFAULT_URL = process.env.QDRANT_URL || "http://localhost:6333";

const API_KEY = process.env.QDRANT_API_KEY || "";

const EXPORT_DIR =
  process.env.EXPORT_DIR || path.join(process.cwd(), "exports", "qdrant");

const PAGE_SIZE = 256;

const rl = readline.createInterface({ input, output });

async function ask(question, defaultValue = "") {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue;
}

async function askYesNo(question, defaultValue = false) {
  const suffix = defaultValue ? " [Y/n]: " : " [y/N]: ";
  while (true) {
    const answer = (await rl.question(`${question}${suffix}`))
      .trim()
      .toLowerCase();

    if (!answer) return defaultValue;
    if (["y", "yes"].includes(answer)) return true;
    if (["n", "no"].includes(answer)) return false;

    console.log("Please enter yes or no.");
  }
}

async function qdrantRequest(baseUrl, endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;

  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(API_KEY ? { "api-key": API_KEY } : {}),
    ...options.headers,
  };

  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: AbortSignal.timeout(120_000),
      });

      const responseText = await response.text();

      if (!response.ok) {
        const error = new Error(
          `HTTP ${response.status}: ${responseText.slice(0, 1000)}`,
        );

        if (
          attempt < maxAttempts &&
          (response.status === 429 || response.status >= 500)
        ) {
          console.warn(
            `Temporary Qdrant error on ${endpoint}; ` +
              `retry ${attempt}/${maxAttempts - 1}`,
          );
          await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
          continue;
        }

        throw error;
      }

      if (!responseText) return {};

      return JSON.parse(responseText);
    } catch (error) {
      if (error.message.startsWith("HTTP ") || error instanceof SyntaxError) {
        throw error;
      }

      const cause = error.cause;
      const detail = [error.name, error.message, cause?.code, cause?.message]
        .filter(Boolean)
        .join(" | ");

      if (attempt === maxAttempts) {
        throw new Error(
          `Qdrant request failed after ${maxAttempts} attempts.\n` +
            `Endpoint: ${endpoint}\n` +
            `Cause: ${detail}`,
        );
      }

      console.warn(`Request failed (${attempt}/${maxAttempts}): ${detail}`);

      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  throw new Error(`Qdrant request failed: ${endpoint}`);
}

async function listCollections(baseUrl) {
  const data = await qdrantRequest(baseUrl, "/collections");
  return data.result?.collections || [];
}

async function getCollectionInfo(baseUrl, collectionName) {
  return qdrantRequest(
    baseUrl,
    `/collections/${encodeURIComponent(collectionName)}`,
  );
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function exportCollection(
  baseUrl,
  collectionName,
  outputPath,
  includeVectors,
  expectedCount,
) {
  const tempPath = `${outputPath}.${process.pid}.tmp`;
  let file;

  let exportedCount = 0;
  let offset;
  let firstPoint = true;

  try {
    file = await open(tempPath, "wx");

    const metadata = {
      collection: collectionName,
      exported_at: new Date().toISOString(),
      vectors_included: includeVectors,
    };

    await file.write(
      `{\n` +
        `  "collection": ${JSON.stringify(metadata.collection)},\n` +
        `  "exported_at": ${JSON.stringify(metadata.exported_at)},\n` +
        `  "vectors_included": ${includeVectors},\n` +
        `  "points": [\n`,
    );

    while (true) {
      const body = {
        limit: PAGE_SIZE,
        with_payload: true,
        with_vector: includeVectors,
      };

      if (offset !== undefined && offset !== null) {
        body.offset = offset;
      }

      const data = await qdrantRequest(
        baseUrl,
        `/collections/${encodeURIComponent(collectionName)}/points/scroll`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );

      const result = data.result || {};
      const points = result.points || [];

      for (const point of points) {
        const exportedPoint = {
          id: point.id,
          payload: point.payload ?? {},
        };

        if (includeVectors) {
          exportedPoint.vector = point.vector ?? null;
        }

        const serialized = JSON.stringify(exportedPoint, null, 2);
        const indented = serialized
          .split("\n")
          .map((line) => `    ${line}`)
          .join("\n");

        if (!firstPoint) {
          await file.write(",\n");
        }

        await file.write(indented);

        firstPoint = false;
        exportedCount++;
      }

      if (expectedCount > 0) {
        const percentage = Math.min(
          100,
          Math.round((exportedCount / expectedCount) * 100),
        );

        output.write(
          `\rProgress: ${percentage}% ` +
            `(${exportedCount}/${expectedCount} points)   `,
        );
      } else {
        output.write(`\rExported ${exportedCount} points...   `);
      }

      const nextOffset = result.next_page_offset;

      if (
        points.length === 0 ||
        nextOffset === undefined ||
        nextOffset === null
      ) {
        break;
      }

      offset = nextOffset;
    }

    await file.write("\n  ]\n}\n");
    await file.sync();
    await file.close();
    file = undefined;

    // Finalize only after the complete JSON has been written.
    // On Linux, rename replaces an existing destination atomically.
    await rename(tempPath, outputPath);

    const fileInfo = await stat(outputPath);

    output.write("\n");

    console.log("\nExport completed successfully.");
    console.log(`Collection: ${collectionName}`);
    console.log(`Points exported: ${exportedCount}`);
    console.log(`Vectors included: ${includeVectors ? "Yes" : "No"}`);
    console.log(`File: ${outputPath}`);
    console.log(`Size: ${formatBytes(fileInfo.size)}`);

    if (expectedCount !== undefined && exportedCount !== expectedCount) {
      console.warn(
        `Warning: collection reported ${expectedCount} points, ` +
          `but ${exportedCount} were exported.`,
      );
    }

    return exportedCount;
  } catch (error) {
    if (file) {
      try {
        await file.close();
      } catch {
        // Preserve the original error.
      }
    }

    try {
      await unlink(tempPath);
    } catch {
      // The temporary file may not exist.
    }

    throw error;
  }
}

async function main() {
  console.log("==============================================");
  console.log(" Clara AI - Qdrant JSON Exporter");
  console.log("==============================================");

  const enteredUrl = await ask("Qdrant URL", DEFAULT_URL);
  const baseUrl = enteredUrl.replace(/\/+$/, "");

  // Validate the URL before sending requests.
  const parsedUrl = new URL(baseUrl);

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Qdrant URL must use HTTP or HTTPS.");
  }

  console.log(`\nConnecting to ${baseUrl}...`);

  const collections = await listCollections(baseUrl);

  if (collections.length === 0) {
    console.log("No collections found.");
    return;
  }

  const collectionDetails = [];

  for (const collection of collections) {
    try {
      const info = await getCollectionInfo(baseUrl, collection.name);

      collectionDetails.push({
        name: collection.name,
        points: info.result?.points_count ?? 0,
      });
    } catch (error) {
      console.warn(
        `Could not retrieve details for ${collection.name}:`,
        error.message,
      );

      collectionDetails.push({
        name: collection.name,
        points: "unknown",
      });
    }
  }

  console.log(`Found ${collections.length} collections.`);
  console.log(`Export directory: ${EXPORT_DIR}\n`);

  await mkdir(EXPORT_DIR, { recursive: true });

  while (true) {
    console.log("Available Qdrant collections:");
    console.log("-".repeat(75));

    collectionDetails.forEach((collection, index) => {
      console.log(
        `${index + 1}. ${collection.name} | Points: ${collection.points}`,
      );
    });

    console.log("-".repeat(75));

    const selection = await ask("\nSelect a collection number (or q to quit)");

    if (selection.toLowerCase() === "q") break;

    const index = Number(selection) - 1;

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= collectionDetails.length
    ) {
      console.log("Invalid selection. Try again.\n");
      continue;
    }

    const selected = collectionDetails[index];
    const defaultFilename = `${safeFilename(selected.name)}.json`;

    const filename = await ask("Output filename", defaultFilename);

    // Keep the output inside EXPORT_DIR.
    const safeOutputName = path.basename(filename);

    if (!safeOutputName.toLowerCase().endsWith(".json")) {
      console.log("Please use a .json filename.\n");
      continue;
    }

    const outputPath = path.join(EXPORT_DIR, safeOutputName);

    let existingFile = false;

    try {
      await stat(outputPath);
      existingFile = true;
    } catch {
      // No existing destination.
    }

    if (
      existingFile &&
      !(await askYesNo(
        `File "${safeOutputName}" already exists. Overwrite it?`,
        false,
      ))
    ) {
      console.log("Export cancelled.\n");
      continue;
    }

    const includeVectors = await askYesNo(
      "Include vector embeddings in the JSON export?",
      false,
    );

    console.log(`\nExporting: ${selected.name}`);
    console.log(`Destination: ${outputPath}`);
    console.log(`Include vectors: ${includeVectors ? "Yes" : "No"}`);

    try {
      await exportCollection(
        baseUrl,
        selected.name,
        outputPath,
        includeVectors,
        typeof selected.points === "number" ? selected.points : undefined,
      );
    } catch (error) {
      console.error("\nExport failed:", error.message);
      console.error(
        "The incomplete temporary export was discarded where possible.",
      );
    }

    if (!(await askYesNo("\nExport another collection?", false))) {
      break;
    }

    console.log("");
  }

  console.log("\nFinished.");
}

main()
  .catch((error) => {
    console.error("\nFatal error:", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
  });
