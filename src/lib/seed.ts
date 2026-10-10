import { db } from "@/lib/db";
import { MODEL_CATALOGUE } from "@/lib/model-catalogue";
import { PLANS } from "@/lib/plans";
import { appendAudit } from "@/lib/audit";
import { localDayStart } from "@/lib/quota";
import { refreshRollups } from "@/lib/usage";

/**
 * Demo seed — the platform as it would look mid-operation:
 *  - model catalogue (WS-0.4 split) and the four plan tiers
 *  - one organisation per tier with users, agents and KBs
 *  - 30 days of usage history + hash-chained audit history
 *  - the Free org sits just below the 80% warning so the whole
 *    warning → 402 → upgrade journey is demoable in one session
 */
export async function seedDatabase() {
  // wipe (demo reset)
  await db.$transaction([
    db.usageEvent.deleteMany(),
    db.auditLog.deleteMany(),
    db.usageCounter.deleteMany(),
    db.softWarning.deleteMany(),
    db.idempotencyKey.deleteMany(),
    db.dailyUsageRollup.deleteMany(),
    db.validationRun.deleteMany(),
    db.message.deleteMany(),
    db.conversation.deleteMany(),
    db.knowledgeBase.deleteMany(),
    db.agent.deleteMany(),
    db.user.deleteMany(),
    db.organization.deleteMany(),
    db.modelEntry.deleteMany(),
    db.plan.deleteMany(),
  ]);

  // catalogues
  await db.modelEntry.createMany({
    data: MODEL_CATALOGUE.map((m) => ({
      id: m.id,
      family: m.family,
      displayName: m.displayName,
      provider: m.provider,
      contextTokens: m.contextTokens,
      inputCostPerMillionMicros: BigInt(m.inputCostPerMillionMicros),
      outputCostPerMillionMicros: BigInt(m.outputCostPerMillionMicros),
      dimensions: m.dimensions ?? null,
      tier: m.tier,
    })),
  });
  await db.plan.createMany({
    data: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      priceInr: p.priceInr,
      requestsDay: p.requestsDay,
      requestsMonth: p.requestsMonth,
      kbs: p.kbs,
      storageBytes: BigInt(p.storageBytes),
      seats: p.seats,
      maxModelTier: p.maxModelTier,
      features: JSON.stringify(p.features),
      renewalDay: p.renewalDay,
    })),
  });

  // platform admin
  const admin = await db.user.create({
    data: {
      email: "admin@clara.ai",
      name: "Platform Admin",
      role: "platform_admin",
      orgId: null,
    },
  });

  const orgSpecs = [
    {
      name: "Acme Research (Free)",
      planId: "free",
      agentModels: ["gpt-5.6-sol"],
      members: ["Priya Sharma"],
      kbs: 1,
      kbBytes: 6 * 1048576,
      todayRequests: 44, // just below the 80% warning (40/50)
      monthRequests: 210,
      historyWeight: 0.4,
    },
    {
      name: "BrightScale Support (Starter)",
      planId: "starter",
      agentModels: ["gpt-4o", "gpt-5.6-luna"],
      members: ["Arjun Mehta", "Neha Iyer"],
      kbs: 4,
      kbBytes: 180 * 1048576,
      todayRequests: 112,
      monthRequests: 1900,
      historyWeight: 1.0,
    },
    {
      name: "Cortex Legal (Pro)",
      planId: "pro",
      agentModels: ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-4o"],
      members: ["Rohan Kapoor", "Sneha Nair", "Vikram Singh"],
      kbs: 12,
      kbBytes: 2.1 * 1024 * 1048576,
      todayRequests: 460,
      monthRequests: 9800,
      historyWeight: 1.6,
    },
    {
      name: "Vertex Global (Enterprise)",
      planId: "enterprise",
      agentModels: ["gpt-5.6-terra", "gpt-5.6-luna"],
      members: ["Ananya Rao", "Dev Patel", "Kavya Reddy", "Farhan Ali"],
      kbs: 33,
      kbBytes: 9.4 * 1024 * 1048576,
      todayRequests: 720,
      monthRequests: 21000,
      historyWeight: 2.2,
    },
  ];

  const dayStart = localDayStart("Asia/Calcutta");
  const samplePrompts = [
    "What does our refund policy say about partial refunds?",
    "Summarise the confidentiality clause in the NDA template",
    "How do I escalate a priority ticket to tier 3?",
    "Draft a reply to the vendor about delayed shipment",
    "Which documents are expiring this quarter?",
    "Explain the SLA commitments in plain language",
    "What are the onboarding steps for new contractors?",
    "Compare pricing tiers mentioned in the sales playbook",
    "Extract the payment terms from the latest invoice",
    "What security certifications do we hold currently?",
    "Give me the key points from the board deck",
    "Who is the approver for travel reimbursements?",
  ];
  const sampleAnswers = [
    "Our refund policy allows partial refunds within 14 days of purchase when the service tier was not fully consumed. The finance team processes these every Friday, and the policy requires the original payment reference plus a one-line reason code for the audit trail.",
    "The confidentiality clause covers all non-public information exchanged during the engagement, survives termination for three years, and carves out information that is publicly available through no fault of the receiving party.",
    "Priority tickets escalate to tier 3 when the customer-facing impact is confirmed by two senior agents or when the issue blocks revenue operations. Escalation happens in the ticket system, never over chat, so the audit trail stays intact.",
    "Here is a draft you can adapt: we acknowledge the shipment delay, reference the agreed delivery window, propose a revised date, and offer a goodwill credit on the next order. Keep the tone factual and avoid admitting fault before logistics confirms the cause.",
    "Based on the document register, four agreements expire this quarter: two vendor contracts in month one, one office lease at mid-quarter, and the data-processing addendum which needs renewal before the compliance review.",
    "The SLA commits to a 4-hour first response for critical issues, 24 hours for high, and 3 business days for normal requests. Uptime is guaranteed at 99.5 percent monthly, with service credits issued automatically when the threshold is missed.",
    "New contractors complete identity verification, sign the IP assignment, complete security training, and receive scoped access on day one. Their manager confirms tool access in the onboarding checklist, and HR archives everything to the compliance folder.",
    "The sales playbook lists three pricing tiers with volume discounts above five hundred seats. Enterprise includes dedicated support and custom terms. The comparison table in section three breaks down per-feature limits for each tier.",
    "The invoice specifies net-30 payment terms with a two percent early-payment discount inside ten days. Late amounts accrue interest at eighteen percent per annum, and disputed charges must be raised within seven days of the invoice date.",
    "We currently hold ISO 27001 and SOC 2 Type II. The SOC 2 report covers security, availability, and confidentiality, and the ISO certificate spans the infrastructure and application layers. The penetration test summary is available under NDA.",
    "The board deck highlights revenue growth of twenty-eight percent, net retention at one hundred twelve percent, and the expansion into two new regions. The key risks section flags hiring velocity and the pending renewal of the largest enterprise account.",
    "Travel reimbursements above fifty thousand require the department head, and above two lakh additionally require finance sign-off. Submit within thirty days of travel with itemised receipts attached; the policy document has the full matrix by expense type.",
  ];

  for (const spec of orgSpecs) {
    const org = await db.organization.create({
      data: {
        name: spec.name,
        planId: spec.planId,
        timezone: "Asia/Calcutta",
        renewalDate: new Date(Date.now() + 12 * 864e5),
        storageUsedBytes: BigInt(Math.round(spec.kbBytes)),
      },
    });
    const orgAdmin = await db.user.create({
      data: {
        email: `admin@${spec.name.split(" ")[0].toLowerCase()}.test`,
        name: `${spec.name.split(" ")[0]} Admin`,
        role: "org_admin",
        orgId: org.id,
      },
    });
    for (const m of spec.members) {
      await db.user.create({
        data: {
          email: `${m.split(" ")[0].toLowerCase()}@${spec.name.split(" ")[0].toLowerCase()}.test`,
          name: m,
          role: "member",
          orgId: org.id,
        },
      });
    }
    const agents = [];
    for (let i = 0; i < spec.agentModels.length; i++) {
      agents.push(
        await db.agent.create({
          data: {
            orgId: org.id,
            name: `${["Support", "Research", "Legal", "Ops"][i]} Assistant ${i + 1}`,
            modelId: spec.agentModels[i],
            systemPrompt:
              "You are Clara, a precise, helpful AI assistant for business teams. Answer concisely and cite the knowledge base when relevant.",
          },
        })
      );
    }
    for (let i = 0; i < spec.kbs; i++) {
      await db.knowledgeBase.create({
        data: {
          orgId: org.id,
          name: `${org.name.split(" ")[0]} KB ${i + 1}`,
          embeddingModelId: i % 2 === 0 ? "text-embedding-3-small" : "text-embedding-3-large",
          dimensions: i % 2 === 0 ? 1536 : 3072,
          bytes: BigInt(Math.round(spec.kbBytes / spec.kbs)),
        },
      });
    }

    // ---- history: usage events + audit chain, 30 days ----
    const users = await db.user.findMany({ where: { orgId: org.id } });
    let promptIdx = 0;
    for (let d = 29; d >= 0; d--) {
      const dayBase = new Date(dayStart.getTime() - d * 864e5);
      const dailyCount = Math.max(
        1,
        Math.round(
          (d === 0 ? spec.todayRequests : (spec.monthRequests / 30) * spec.historyWeight) *
            (d === 0 ? 1 : 0.6 + Math.random() * 0.8)
        )
      );
      for (let i = 0; i < dailyCount; i++) {
        const at = new Date(
          dayBase.getTime() + Math.floor(Math.random() * 10 * 3600_000) + i * 60_000
        );
        const user = users[Math.floor(Math.random() * users.length)];
        const agent = agents[Math.floor(Math.random() * agents.length)];
        const pi = promptIdx++ % samplePrompts.length;
        const promptTokens = 40 + Math.floor(Math.random() * 120);
        const completionTokens = 90 + Math.floor(Math.random() * 260);
        const latencyMs = 700 + Math.floor(Math.random() * 2600);
        await db.usageEvent.create({
          data: {
            orgId: org.id,
            userId: user.id,
            kind: "CHAT",
            agentId: agent.id,
            model: agent.modelId,
            promptTokens,
            completionTokens,
            latencyMs,
            costUsdMicros: BigInt(
              Math.round(
                (promptTokens * 3000 + completionTokens * 12000) / 1_000_000
              )
            ),
            createdAt: at,
          },
        });
        // audit pair — appended through the chain so history verifies
        const conv = await db.conversation.create({
          data: {
            orgId: org.id,
            userId: user.id,
            agentId: agent.id,
            title: samplePrompts[pi].slice(0, 60),
            createdAt: at,
          },
        });
        await appendAudit({
          orgId: org.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "PROMPT",
          agentId: agent.id,
          conversationId: conv.id,
          promptText: samplePrompts[pi],
          model: agent.modelId,
        });
        await appendAudit({
          orgId: org.id,
          actorUserId: user.id,
          actorRole: user.role,
          action: "ANSWER",
          agentId: agent.id,
          conversationId: conv.id,
          answerText: sampleAnswers[pi],
          model: agent.modelId,
          promptTokens,
          completionTokens,
        });
      }
    }

    // seed today's counter so admission control matches the event history
    const todayCount = await db.usageEvent.count({
      where: { orgId: org.id, createdAt: { gte: dayStart }, kind: "CHAT" },
    });
    if (todayCount > 0) {
      await db.usageCounter.create({
        data: {
          orgId: org.id,
          limitKey: "requests_day",
          windowStart: dayStart,
          count: BigInt(todayCount),
        },
      });
    }
    const monthCount = await db.usageEvent.count({
      where: { orgId: org.id, createdAt: { gte: new Date(dayStart.getTime() - 30 * 864e5) }, kind: "CHAT" },
    });
    if (monthCount > 0) {
      await db.usageCounter.create({
        data: {
          orgId: org.id,
          limitKey: "requests_month",
          windowStart: new Date(dayStart.getTime() - 12 * 864e5),
          count: BigInt(monthCount),
        },
      });
    }
    await db.usageCounter.create({
      data: {
        orgId: org.id,
        limitKey: "storage_bytes",
        windowStart: new Date(0),
        count: BigInt(Math.round(spec.kbBytes)),
      },
    });
    await db.usageCounter.create({
      data: {
        orgId: org.id,
        limitKey: "kbs",
        windowStart: new Date(0),
        count: BigInt(spec.kbs),
      },
    });
  }

  // initial billing/config audit rows for the platform itself
  await appendAudit({
    orgId: (await db.organization.findFirst({ where: { planId: "enterprise" } }))!.id,
    actorUserId: admin.id,
    actorRole: "platform_admin",
    action: "BILLING",
    answerText: "Demo data seeded: model catalogue split installed, four plan tiers live, 30-day usage history backfilled.",
  });

  await refreshRollups();

  return {
    orgs: orgSpecs.length,
    users: await db.user.count(),
    agents: await db.agent.count(),
    usageEvents: await db.usageEvent.count(),
    auditRows: await db.auditLog.count(),
    rollups: await db.dailyUsageRollup.count(),
  };
}
