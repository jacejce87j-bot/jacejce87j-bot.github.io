import {
  db,
  agentsTable,
  organizationsTable,
  contactsTable,
  ticketsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("🌱 Seeding database...");

  try {
    // 1. Get or Create Agent
    let [agent1] = await db
      .select()
      .from(agentsTable)
      .where(eq(agentsTable.email, "admin@example.com"));

    if (!agent1) {
      [agent1] = await db
        .insert(agentsTable)
        .values({
          name: "Support Admin",
          email: "admin@example.com",
          role: "admin",
        })
        .returning();
    }

    // 2. Get or Create Organization
    let [org1] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.name, "Acme Corp"));

    if (!org1) {
      [org1] = await db
        .insert(organizationsTable)
        .values({
          name: "Acme Corp",
          domain: "acme.com",
        })
        .returning();
    }

    // 3. Get or Create Contact
    let [contact1] = await db
      .select()
      .from(contactsTable)
      .where(eq(contactsTable.email, "john@acme.com"));

    if (!contact1) {
      [contact1] = await db
        .insert(contactsTable)
        .values({
          name: "John Doe",
          email: "john@acme.com",
          organizationId: org1.id,
        })
        .returning();
    }

    // 4. Insert Tickets
    await db.insert(ticketsTable).values([
      {
        subject: "Unable to reset password",
        description: "User is not receiving the password reset email on login.",
        status: "open",
        priority: "high",
        assigneeId: agent1.id,
        requesterId: contact1.id,
      },
      {
        subject: "Billing discrepancy on July invoice",
        description: "Incorrect charges applied to monthly tracking plan.",
        status: "pending",
        priority: "medium",
        assigneeId: agent1.id,
        requesterId: contact1.id,
      },
      {
        subject: "Feature Request: Export to CSV",
        description: "Add ability to export ticket activity logs to CSV format.",
        status: "closed",
        priority: "low",
        assigneeId: agent1.id,
        requesterId: contact1.id,
      },
    ]);

    console.log("✅ Seeding complete! Database populated successfully.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();