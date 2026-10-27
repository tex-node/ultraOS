import type { Prisma } from "@/generated/prisma/client";

// Public-id prefixes for a NEW organization (streak v20, Prompt 4 - found by the end-to-end proof).
//
// Organization.idPrefixAthlete and .idPrefixStaff are globally @unique with a DEFAULT of "UBA"/"UBS", and the public-id
// counter is tenant-local (see public-ids.ts). That combination means an organization created without explicit prefixes
// takes the defaults - and the SECOND organization ever created fails with "Unique constraint failed on
// (idPrefixAthlete)". The onboarding wizard created organizations exactly that way, so self-serve onboarding worked for
// the first tenant on a database and broke for every one after it. The proof script hit it before a customer could.
//
// The prefix is derived from the slug (readable in a public id, which is the point of the prefix), then extended with a
// counter until it is free. Three characters, letters only: public ids are formatted PREFIX-NNN.
export async function allocateOrganizationPrefixes(
  tx: Prisma.TransactionClient,
  slug: string,
): Promise<{ idPrefixAthlete: string; idPrefixStaff: string }> {
  const base = (slug.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3) || "ORG").padEnd(3, "X");

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const suffix = attempt === 0 ? "" : String(attempt + 1);
    const prefix = `${base.slice(0, Math.max(1, 3 - suffix.length))}${suffix}`.toUpperCase();
    const taken = await tx.organization.findFirst({
      where: { OR: [{ idPrefixAthlete: prefix }, { idPrefixStaff: prefix }] },
      select: { id: true },
    });
    if (!taken) return { idPrefixAthlete: prefix, idPrefixStaff: prefix };
  }
  throw new Error(`Could not find a free public-id prefix for "${slug}" (200 attempts).`);
}
