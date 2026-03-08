import { loadFileAsText } from "./src/modules/admin/core/ingest/document-loader";

async function main() {
  const file = process.argv[2] || "SEP PROJECT FINAL.pdf";
  console.log(`Loading document: ${file}`);
  try {
    const doc = await loadFileAsText(file);
    console.log("Document parsed successfully!");
    console.log(`Title: ${doc.title}`);
    console.log(`Metadata:`, doc.metadata);
    console.log(`Text preview (first 250 chars):\n${doc.text.substring(0, 250)}...`);
    console.log(`Text preview (last 250 chars):\n${doc.text.substring(doc.text.length - 250)}`);
    console.log(`Total Length: ${doc.text.length}`);
  } catch (err) {
    console.error("Failed to parse document:", err);
  }
}

main().catch(console.error);
