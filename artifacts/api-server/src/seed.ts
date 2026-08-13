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
    // By default we avoid seeding mock tickets, contacts, and organizations.
    // If you explicitly want to seed users only (no mock tickets/templates),
    // set the environment variable `SEED_USERS_ONLY=true` and provide user
    // data via `seed-test-user.sql` or another safe mechanism.
    console.log("ℹ️ Seeding disabled: mock tickets/contacts/orgs will not be created.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  }
}

seed();