"use server";

import { z } from "zod";
import { compare, hash } from "bcryptjs";
import { writeAuditLog } from "@/lib/audit";
import { requireSession } from "@/lib/authorization";
import { formDataToRecord } from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";

export type PasswordFormState = { error?: string; ok?: boolean };

const schema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(200),
  confirmPassword: z.string().min(1, "Confirm the new password."),
});

// Changes the signed-in user's own password. Anyone with a password can change it by proving the
// current one; a Google-only account (no password yet) can set one without a current password.
export async function changePassword(
  _previous: PasswordFormState,
  formData: FormData,
): Promise<PasswordFormState> {
  const session = await requireSession();
  const parsed = schema.safeParse(formDataToRecord(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { currentPassword, newPassword, confirmPassword } = parsed.data;
  if (newPassword !== confirmPassword) return { error: "The new passwords do not match." };

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });

  if (user.passwordHash) {
    if (!currentPassword) return { error: "Enter your current password." };
    if (!(await compare(currentPassword, user.passwordHash))) {
      return { error: "Your current password is incorrect." };
    }
    if (await compare(newPassword, user.passwordHash)) {
      return { error: "Choose a password different from your current one." };
    }
  }

  const passwordHash = await hash(newPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      // Bump the version so every other device's session stops matching (see lib/session-version).
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await writeAuditLog(tx, {
      userId: user.id,
      action: "PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      organizationId: session.user.organizationId ?? undefined,
      details: { hadPassword: Boolean(user.passwordHash) },
    });
  });

  // Re-issuing this device's session happens on the client (change-password-form calls
  // credentials sign-in with the new password), because calling signIn inside this action leaves the
  // submission hanging. Every other device keeps its old token and is signed out on its next load.
  // No revalidatePath here, deliberately: re-rendering the page server-side would run with this
  // request's still-old token, fail the version check, and bounce to /login before the client can
  // re-authenticate. The form re-signs in and refreshes itself instead.
  return { ok: true };
}
