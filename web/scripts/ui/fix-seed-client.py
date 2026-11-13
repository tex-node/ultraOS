"""Use the application's Prisma client in the test seed.

Prisma 7 requires an adapter, and this repo constructs PrismaClient in src/lib/prisma with @prisma/adapter-pg. A seed that
builds its own client throws PrismaClientInitializationError before it reads a single row.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
seed = ROOT / "prisma/seed-test.ts"
script = ROOT / "scripts/e2e-local.mjs"

source = seed.read_text(encoding="utf-8")
source = source.replace(
    'import { PrismaClient } from "../src/generated/prisma/client";',
    'import { prisma } from "../src/lib/prisma";',
)
source = source.replace("const prisma = new PrismaClient();\n\n", "")
seed.write_text(source, encoding="utf-8", newline="\n")
print("seed: uses the application client")

runner = script.read_text(encoding="utf-8")
runner = runner.replace(
    '''    ["tsx", "--eval", `
      import { PrismaClient } from "./src/generated/prisma/client";
      const prisma = new PrismaClient();
      const org = await prisma.organization.findUnique({ where: { slug: process.env.E2E_ORG_SLUG }, select: { id: true } });''',
    '''    ["tsx", "--eval", `
      import { prisma } from "./src/lib/prisma";
      const org = await prisma.organization.findUnique({ where: { slug: process.env.E2E_ORG_SLUG }, select: { id: true } });''',
)
script.write_text(runner, encoding="utf-8", newline="\n")
print("runner: uses the application client")
