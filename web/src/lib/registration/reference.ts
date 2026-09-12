import { randomBytes } from "node:crypto";

// Human-quotable, browser-safe, unguessable-enough reference for a registration
// submission. Organization-scoped unique in the database
// (@@unique([organizationId, referenceNumber])); collisions are retried.
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // no I/L/O/0/1 confusion

export function generateRegistrationReference(bytes: () => Buffer = () => randomBytes(10)): string {
  const buf = bytes();
  let out = "";
  for (let i = 0; i < buf.length && out.length < 10; i += 1) out += ALPHABET[buf[i] % ALPHABET.length];
  while (out.length < 10) out += "A";
  return `REG-${out}`;
}

export function isReferenceConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

// Allocates a reference and runs `create`. Retries only on a unique-constraint
// conflict (P2002), which in this context is the org-scoped referenceNumber.
export async function createWithReference<T>(
  create: (referenceNumber: string) => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await create(generateRegistrationReference());
    } catch (error) {
      if (!isReferenceConflict(error)) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not allocate a unique registration reference.");
}
