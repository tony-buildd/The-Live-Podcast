import { describe, it, expect, afterAll } from "vitest";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

describe("Prisma client smoke test", () => {
  const connectionString =
    process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({ url: connectionString });
  const prisma = new PrismaClient({ adapter });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to SQLite database successfully", async () => {
    const result = await prisma.$queryRawUnsafe<Array<Record<string, number>>>(
      "SELECT 1 AS ok"
    );
    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(Number(result[0].ok)).toBe(1);
  });

  it("can list users (empty table)", async () => {
    const users = await prisma.user.findMany();
    expect(Array.isArray(users)).toBe(true);
  });
});
