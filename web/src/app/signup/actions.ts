"use server";

import { hash } from "bcryptjs";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { UserRole } from "@/generated/prisma/enums";
import { writeAuditLog } from "@/lib/audit";
import { formDataToRecord } from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must contain at least 2 characters.").max(100),
    email: z
      .string()
      .trim()
      .email("Enter a valid email address.")
      .transform((value) => value.toLowerCase()),
    password: z
      .string()
      .min(8, "Password must contain at least 8 characters.")
      .max(128, "Password must contain 128 characters or fewer."),
    confirmPassword: z.string(),
    callbackUrl: z.string().trim().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export type SignupState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function signupFailure(error: unknown): SignupState {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    return { error: "An account already exists for this email address." };
  }
  return { error: "Signup failed. Please try again." };
}

export async function createFanAccount(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const parsed = signupSchema.safeParse(formDataToRecord(formData));
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: parsed.data.name,
          email: parsed.data.email,
          passwordHash: await hash(parsed.data.password, 12),
          role: UserRole.FAN,
          isActive: true,
          roles: {
            create: { role: UserRole.FAN },
          },
        },
      });
      await writeAuditLog(tx, {
        userId: created.id,
        action: "USER_SIGNED_UP",
        entityType: "User",
        entityId: created.id,
        details: { role: UserRole.FAN, source: "public_signup" },
      });
    });

    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: parsed.data.callbackUrl || "/public/events",
    });
    return {};
  } catch (error) {
    unstable_rethrow(error);
    return signupFailure(error);
  }
}
