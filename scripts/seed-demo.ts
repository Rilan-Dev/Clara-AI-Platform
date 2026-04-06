#!/usr/bin/env tsx

import { pool } from "../src/lib/db";
import { seedDemoData } from "../src/lib/db/demo-seed";

async function main() {
  const isReset = process.argv.includes("--reset");

  try {
    await seedDemoData({ reset: isReset });

    if (!isReset) {
      console.log("\nLogin credentials:");
      console.log("  Platform admin:   admin@clara.ai             / Admin1234!");
      console.log("  Omen admin:       admin@omeninsurance.com    / Omen1234!");
      console.log("  TechVision admin: admin@techvision.io        / Tech1234!\n");
    }
  } catch (error) {
    console.error("[seed] Failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main();
