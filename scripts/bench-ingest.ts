/**
 * scripts/bench-ingest.mjs (run via tsx as bench-ingest.ts sibling — see
 * scripts/bench-ingest.ts) — ingests the benchmark KB content into the demo
 * KB's Qdrant collection using the app's own upsertDocumentsKb so the payload
 * shape exactly matches what RAG search expects.
 */

import { randomUUID } from "node:crypto";
import { pool } from "../src/lib/db";
import { upsertDocumentsKb } from "../src/modules/admin/core/vector-store-kb";

const KB_ID = "30000000-0000-0000-0000-000000000001";
const COLLECTION = "omen_life_health";

const FAQ = `
Clara Health Shield Policy — Frequently Asked Questions

Coverage Basics
Question: What does the Health Shield policy cover?
Answer: The Health Shield policy covers inpatient hospitalization expenses, ICU charges, surgeon and doctor fees, room rent up to the chosen plan limit, pre and post hospitalization expenses for 60 and 90 days respectively, day care procedures listed in the policy schedule, and ambulance charges up to 2,000 rupees per hospitalization. The policy pays for these expenses after the deductible is met, subject to the sum insured chosen at purchase.

Question: What is the sum insured range for Health Shield?
Answer: Health Shield is available with sum insured options from 300,000 rupees to 5,000,000 rupees. The base plan starts at 300,000, mid plans are 500,000 and 1,000,000, and top plans go up to 5,000,000 rupees with a restore benefit that refills the sum insured once per policy year after it is exhausted.

Question: Does the policy cover outpatient consultations?
Answer: Standard outpatient doctor consultations are not covered by the base Health Shield plan. However, the OPD Care optional rider covers up to 10 outpatient consultations per policy year at 1,500 rupees per visit, including prescribed diagnostics, when added at an additional premium.

Hospitalization and Treatment
Question: How long is the waiting period for pre-existing diseases?
Answer: Pre-existing diseases are covered after a waiting period of 36 continuous months of coverage since the policy inception date. If the policy is renewed without a break, the waiting period credit carries forward. Conditions first diagnosed during this waiting period are treated as pre-existing and remain subject to the same 36 month rule.

Question: What is the waiting period for specific treatments?
Answer: Cataract treatment, joint replacement surgery, and hernia repair each have a 24 month waiting period from policy inception. Maternity and maternity-related complications have a 36 month waiting period and are only covered under the Family Care rider. No waiting period applies to accidental emergency hospitalization, which is covered from day one.

Question: Is ambulance service covered?
Answer: Road ambulance charges are covered up to 2,000 rupees per hospitalization event when the ambulance is used to transport the insured to the nearest network hospital. Air ambulance is covered only under the Elite plan with a sub limit of 100,000 rupees per policy year.

Claims Process
Question: How do I file a cashless claim?
Answer: For planned hospitalization, show your health card at any network hospital at least 48 hours before admission and the hospital will send the pre authorization request to us directly. For emergency admission, the hospital must submit the pre authorization request within 24 hours of admission. Cashless requests are approved or declined within 2 hours of receiving complete documents during working hours.

Question: How do I file a reimbursement claim?
Answer: Submit the claim form with original hospital bills, discharge summary, investigation reports, pharmacy bills with prescriptions, and the cancelled cheque for payout within 60 days of discharge. Reimbursement claims are processed within 15 working days of receiving all documents, and payment is transferred to the registered bank account. Late intimation beyond 60 days requires a delay justification letter.

Question: What documents are required for a claim?
Answer: The mandatory documents are the duly signed claim form, the original final hospital bill with payment receipt, the discharge summary, all investigation and diagnostic reports, the pharmacy bills with the doctor's prescription, the FIR or medico legal certificate if applicable for accidental cases, and a cancelled cheque or bank passbook copy for electronic fund transfer.

Question: When can a claim be rejected?
Answer: A claim can be rejected if the hospitalization falls inside a contractual waiting period, the disease was not disclosed in the proposal form, the treatment is for an excluded condition such as cosmetic surgery or dental work unless accident related, the claim documents are incomplete even after a 30 day deficiency notice, or the policy was in a lapsed state on the admission date. Every rejection is communicated in writing with the specific clause cited.

Premium, Renewal and Savings
Question: How is the premium calculated?
Answer: The premium depends on the sum insured chosen, the age of the oldest insured member, the number of family members covered, the optional riders selected, and the city tier of your residence. Family floater plans are rated on the age of the eldest member. Premiums are revised at renewal only as permitted by the filed rate schedule applicable at that time.

Question: What is the no claim bonus?
Answer: For every claim free year, the sum insured increases by 10 percent at renewal, up to a maximum accumulation of 50 percent of the base sum insured, without any increase in premium. Making a claim resets the accumulated bonus by 50 percent of the earned amount at the next renewal, and the bonus fully resets only after two consecutive claim years.

Question: What tax benefit does the premium qualify for?
Answer: Premium paid for self, spouse, and dependent children qualifies for deduction under section 80D of the Income Tax Act up to 25,000 rupees per year, with an additional 25,000 rupees for premium covering parents, or 50,000 rupees if the parents are senior citizens. Preventive health checkup expenses up to 5,000 rupees are included within the overall limit.

Question: How do I renew the policy?
Answer: Renew the policy online through the customer portal or mobile app at any time before the expiry date. A grace period of 30 days applies for renewal, but no hospitalization occurring during a lapsed period is covered even if the policy is renewed within grace. Renewal within the grace period preserves continuity benefits such as waiting period credit and no claim bonus.

Exclusions and Sub Limits
Question: What is not covered under Health Shield?
Answer: The permanent exclusions include cosmetic and aesthetic surgery unless resulting from an accident, dental treatment unless requiring hospitalization due to accident, self inflicted injuries, hazardous adventure sports, treatment for substance abuse, experimental or unproven treatments, infertility and assisted reproduction, and any treatment not medically necessary. Congenital conditions are covered only when manifested after 36 months of continuous coverage.

Question: Are there sub limits on room rent?
Answer: The base plan caps room rent at 2 percent of the sum insured per day and ICU at 5 percent of the sum insured per day. The Elite plan has no room rent or ICU sub limit. If the actual room rent exceeds the sub limit, associated hospitalization expenses other than medicines and implants are proportionately reduced before claim calculation.

Question: Is alternative medicine covered?
Answer: Ayurveda, Yoga and Naturopathy, Unani, Siddha and Homeopathy treatments are covered up to 25 percent of the sum insured per policy year when received at a government recognized hospital or institute, subject to a 24 month waiting period from policy inception.

Network and Support
Question: How many network hospitals does the insurer have?
Answer: The insurer maintains a network of more than 14,500 hospitals across India for cashless treatment, including 2,300 hospitals offering day care procedures. The complete searchable hospital list is available in the customer portal and mobile app under Find a Hospital, filtered by city, treatment specialty and cashless availability.

Question: What is the free look period?
Answer: You may review the policy for 15 days from the date of receiving the policy documents. If you disagree with any terms, return the policy within this free look period for a refund of the premium paid, subject to deduction of proportionate risk cover for the days elapsed, stamp duty charges, and the cost of any medical tests conducted.
`;

async function main() {
  try {
    process.loadEnvFile(".env.bench");
  } catch { /* optional */ }

  const docId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO documents (id, kb_id, title, original_filename, source_type, mime_type,
                              file_size, chunk_count, status, uploaded_by)
       VALUES ($1, $2, 'Insurance FAQs (Bench)', 'faqs-bench.txt', 'upload', 'text/plain',
               $3, $4, 'ready', '40000000-0000-0000-0000-000000000001')
       ON CONFLICT (id) DO NOTHING`,
      [docId, KB_ID, Buffer.byteLength(FAQ), 0]
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }

  const chunks = FAQ.split(/\n(?=Question:)/).map(s => s.trim()).filter(s => s.length > 50);
  console.log(`[bench-ingest] ${chunks.length} chunks from doc ${docId}`);

  await upsertDocumentsKb(COLLECTION, chunks, {
    kbId: KB_ID,
    documentId: docId,
    title: "Insurance FAQs (Bench)",
    originalFilename: "faqs-bench.txt",
  });

  await pool.query(`UPDATE documents SET chunk_count = $2 WHERE id = $1`, [docId, chunks.length]);
  console.log(`[bench-ingest] done — collection=${COLLECTION} chunks=${chunks.length}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[bench-ingest] FAILED:", err);
  process.exit(1);
});
