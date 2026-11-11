import { db } from "../db";
import { json } from "../mappers";
import { daysAgo, type SeedContext } from "./people";

type Doc = {
  id: string;
  title: string;
  docType: string;
  version: string;
  status: "active" | "inactive";
  daysAgo: number;
  ownerId: string;
  sections: { heading: string; passage: string }[];
};

// The documents the answers come from. Nothing here mentions a security certification, so a question
// about one returns "Not confirmed". Pricing guide v4 is out of date but still active, so the admin
// has something to deactivate in the demo.
export const DOCUMENTS: Doc[] = [
  {
    id: "doc-overview",
    title: "Product overview",
    docType: "guide",
    version: "v4",
    status: "active",
    daysAgo: 40,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "The platform connects sales, operations and finance systems so teams stop re-entering data.",
      },
      {
        heading: "section 3",
        passage: "Ready-made connectors cover SAP and the major carrier portals.",
      },
    ],
  },
  {
    id: "doc-integration-v3",
    title: "Integration guide",
    docType: "guide",
    version: "v3",
    status: "active",
    daysAgo: 12,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "Integration needs read access to the ERP and the systems being connected, and one named technical contact.",
      },
      {
        heading: "section 2",
        passage:
          "Integration runs in three phases over six to eight weeks. The ERP connector is built first, then data migration, then user rollout.",
      },
      {
        heading: "section 3",
        passage:
          "Peak season freezes can be built into the plan. Rollout is scheduled around them.",
      },
    ],
  },
  {
    id: "doc-pricing-v5",
    title: "Pricing guide",
    docType: "pricing",
    version: "v5",
    status: "active",
    daysAgo: 20,
    ownerId: "alex",
    sections: [
      {
        heading: "section 2",
        passage: "Pricing is per site per year. Volume discounts start at five sites.",
      },
      {
        heading: "section 4",
        passage:
          "The implementation fee is fixed at 21,000 dollars. It includes the ERP connector and data migration.",
      },
    ],
  },
  {
    id: "doc-pricing-v4",
    title: "Pricing guide",
    docType: "pricing",
    version: "v4",
    status: "active",
    daysAgo: 210,
    ownerId: "alex",
    sections: [
      {
        heading: "section 4",
        passage:
          "The implementation fee is fixed at 18,000 dollars. It includes the ERP connector.",
      },
    ],
  },
  {
    id: "doc-security",
    title: "Security overview",
    docType: "security",
    version: "v2",
    status: "active",
    daysAgo: 55,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "Customer data is encrypted in transit and at rest. Access is limited by role and logged.",
      },
      {
        heading: "section 2",
        passage:
          "Data stays in the region the customer chooses. Backups are kept in the same region.",
      },
    ],
  },
  {
    id: "doc-data-faq",
    title: "Data handling FAQ",
    docType: "faq",
    version: "v1",
    status: "active",
    daysAgo: 90,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "Call recordings are kept for the retention period the customer sets, then deleted.",
      },
      {
        heading: "section 2",
        passage: "Customers can ask for their data to be exported or deleted at any time.",
      },
    ],
  },
  {
    id: "doc-roi",
    title: "ROI case study: regional manufacturer",
    docType: "case_study",
    version: "v2",
    status: "active",
    daysAgo: 33,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "A regional manufacturer cut report preparation from two days to two hours and recovered the cost in five months.",
      },
    ],
  },
  {
    id: "doc-support",
    title: "Support and service levels",
    docType: "policy",
    version: "v3",
    status: "active",
    daysAgo: 70,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "Support is available on business days. Urgent issues get a first response within four hours.",
      },
    ],
  },
  {
    id: "doc-checklist-v2",
    title: "Implementation checklist",
    docType: "guide",
    version: "v2",
    status: "active",
    daysAgo: 25,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "Before kickoff the customer names a technical contact, shares ERP access and confirms the sites in scope.",
      },
    ],
  },
  {
    id: "doc-checklist-v1",
    title: "Implementation checklist",
    docType: "guide",
    version: "v1",
    status: "inactive",
    daysAgo: 300,
    ownerId: "alex",
    sections: [{ heading: "section 1", passage: "Superseded by v2." }],
  },
  {
    id: "doc-workorders",
    title: "Case study: work order automation",
    docType: "case_study",
    version: "v1",
    status: "active",
    daysAgo: 100,
    ownerId: "alex",
    sections: [
      {
        heading: "section 1",
        passage:
          "An industrial plant removed re-entry of work orders between two systems and saved about forty hours a month.",
      },
    ],
  },
];

export function seedKnowledge(ctx: SeedContext): void {
  for (const doc of DOCUMENTS) {
    db.document.create({
      id: doc.id,
      title: doc.title,
      docType: doc.docType,
      version: doc.version,
      status: doc.status,
      updatedAt: daysAgo(ctx, doc.daysAgo),
      ownerId: doc.ownerId,
      sectionsJson: json(doc.sections),
    });
  }
}
