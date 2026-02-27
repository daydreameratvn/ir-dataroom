import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const prisma = new PrismaClient();

const DEFAULT_NDA_TEXT = `# Non-Disclosure Agreement

**CONFIDENTIALITY AGREEMENT**

This Non-Disclosure Agreement ("Agreement") is entered into by and between the Company ("Disclosing Party") and the undersigned investor ("Receiving Party").

## 1. Confidential Information

"Confidential Information" means any and all non-public information provided by the Disclosing Party, including but not limited to:

- Financial statements, projections, and business plans
- Product roadmaps, technical specifications, and trade secrets
- Customer data, market research, and competitive analysis
- Any other information marked as confidential or that a reasonable person would understand to be confidential

## 2. Obligations of the Receiving Party

The Receiving Party agrees to:

- Hold all Confidential Information in strict confidence
- Not disclose any Confidential Information to third parties without prior written consent
- Use the Confidential Information solely for the purpose of evaluating a potential investment
- Not copy or reproduce any documents except as necessary for evaluation
- Return or destroy all Confidential Information upon request

## 3. Duration

This Agreement shall remain in effect for a period of **two (2) years** from the date of acceptance.

## 4. Remedies

The Receiving Party acknowledges that any breach of this Agreement may cause irreparable harm and that the Disclosing Party shall be entitled to seek equitable relief, including injunction and specific performance, in addition to all other remedies available at law.

## 5. Governing Law

This Agreement shall be governed by and construed in accordance with applicable laws.

---

By accepting below, you acknowledge that you have read, understood, and agree to be bound by the terms of this Non-Disclosure Agreement. Your acceptance is logged with your email address, IP address, and timestamp.`;

async function main() {
  console.log("Seeding database...");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail) {
    await prisma.adminUser.upsert({
      where: { email: adminEmail },
      update: {},
      create: { email: adminEmail },
    });
    console.log("Admin user created:", adminEmail);
  } else {
    console.warn("No ADMIN_EMAIL set in .env — skipping admin user creation");
  }

  const existingNda = await prisma.ndaTemplate.findFirst({
    where: { isActive: true },
  });

  if (!existingNda) {
    await prisma.ndaTemplate.create({
      data: {
        content: DEFAULT_NDA_TEXT,
        isActive: true,
      },
    });
    console.log("Default NDA template created");
  } else {
    console.log("NDA template already exists, skipping");
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
