import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import {
  OrganizationStatus,
  PublicLocatorStatus,
  PublicResourceLocatorType,
  PublicTokenLocatorType,
} from "@/generated/prisma/enums";

type LocatorDb = PrismaClient | Prisma.TransactionClient;

export type PublicLocatorResolution = {
  organizationId: string;
  resourceId: string;
};

type LocatorRow = PublicLocatorResolution & {
  status: PublicLocatorStatus;
  organization: { status: OrganizationStatus };
};

export function hashPublicToken(
  tokenType: PublicTokenLocatorType,
  rawToken: string,
) {
  return createHash("sha256").update(`${tokenType}:${rawToken}`).digest("hex");
}

function activeResolution(row: LocatorRow | null): PublicLocatorResolution | null {
  if (!row) return null;
  if (row.status !== PublicLocatorStatus.ACTIVE) return null;
  if (row.organization.status !== OrganizationStatus.ACTIVE) return null;
  return {
    organizationId: row.organizationId,
    resourceId: row.resourceId,
  };
}

export async function resolvePublicResourceLocator(
  db: LocatorDb,
  resourceType: PublicResourceLocatorType,
  publicKey: string,
) {
  if (!publicKey) return null;
  const row = await db.publicResourceLocator.findUnique({
    where: { resourceType_publicKey: { resourceType, publicKey } },
    select: {
      organizationId: true,
      resourceId: true,
      status: true,
      organization: { select: { status: true } },
    },
  });
  return activeResolution(row);
}

export async function resolvePublicTokenLocator(
  db: LocatorDb,
  tokenType: PublicTokenLocatorType,
  rawToken: string,
) {
  if (!rawToken) return null;
  const tokenHash = hashPublicToken(tokenType, rawToken);
  const row = await db.publicTokenLocator.findUnique({
    where: { tokenType_tokenHash: { tokenType, tokenHash } },
    select: {
      organizationId: true,
      resourceId: true,
      status: true,
      organization: { select: { status: true } },
    },
  });
  return activeResolution(row);
}

export function locatorMatchesResource(
  locator: PublicLocatorResolution,
  resource: { id: string; organizationId: string } | null | undefined,
) {
  return Boolean(
    resource &&
      resource.id === locator.resourceId &&
      resource.organizationId === locator.organizationId,
  );
}

export async function upsertPublicResourceLocator(
  db: LocatorDb,
  input: {
    resourceType: PublicResourceLocatorType;
    publicKey: string;
    organizationId: string;
    resourceId: string;
    status?: PublicLocatorStatus;
  },
) {
  return db.publicResourceLocator.upsert({
    where: {
      resourceType_publicKey: {
        resourceType: input.resourceType,
        publicKey: input.publicKey,
      },
    },
    create: {
      resourceType: input.resourceType,
      publicKey: input.publicKey,
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      status: input.status ?? PublicLocatorStatus.ACTIVE,
    },
    update: {
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      status: input.status ?? PublicLocatorStatus.ACTIVE,
    },
  });
}

export async function upsertPublicTokenLocator(
  db: LocatorDb,
  input: {
    tokenType: PublicTokenLocatorType;
    rawToken: string;
    organizationId: string;
    resourceId: string;
    status?: PublicLocatorStatus;
  },
) {
  const tokenHash = hashPublicToken(input.tokenType, input.rawToken);
  return db.publicTokenLocator.upsert({
    where: {
      tokenType_tokenHash: {
        tokenType: input.tokenType,
        tokenHash,
      },
    },
    create: {
      tokenType: input.tokenType,
      tokenHash,
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      status: input.status ?? PublicLocatorStatus.ACTIVE,
    },
    update: {
      organizationId: input.organizationId,
      resourceId: input.resourceId,
      status: input.status ?? PublicLocatorStatus.ACTIVE,
    },
  });
}
