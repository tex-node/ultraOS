"use server";

import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { ApplicationType } from "@/generated/prisma/enums";
import { applicationConfigs } from "@/app/apply/application-config";
import { formDataToRecord } from "@/lib/club-validation";
import { prisma } from "@/lib/prisma";
import { uploadProfilePhoto } from "@/lib/r2";

export type ApplicationFormState = {
  success?: boolean;
  applicationId?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function fieldError(message: string): string[] {
  return [message];
}

function validateSubmittedData(type: ApplicationType, formData: FormData) {
  const config = applicationConfigs[type];
  const input = formDataToRecord(formData);
  const fieldErrors: Record<string, string[] | undefined> = {};
  const data: Record<string, unknown> = {};

  for (const field of config.fields) {
    if (field.type === "checkbox") {
      const checked = formData.get(field.name) === "on";
      if (field.required && !checked) {
        fieldErrors[field.name] = fieldError("This confirmation is required.");
      }
      data[field.name] = checked;
      continue;
    }

    if (field.type === "file") {
      const file = formData.get(field.name);
      if (field.required && (!(file instanceof File) || file.size === 0)) {
        fieldErrors[field.name] = fieldError("This file is required.");
      }
      continue;
    }

    const rawValue = input[field.name];
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (field.required && value.length === 0) {
      fieldErrors[field.name] = fieldError("This field is required.");
    }
    if (
      field.type === "select" &&
      value.length > 0 &&
      field.options &&
      !field.options.includes(value)
    ) {
      fieldErrors[field.name] = fieldError("Choose one of the listed options.");
    }
    if (field.type === "number" && value.length > 0) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        fieldErrors[field.name] = fieldError("Enter a number greater than zero.");
      }
    }
    if (field.type === "email" && value.length > 0 && !zEmail(value)) {
      fieldErrors[field.name] = fieldError("Enter a valid email address.");
    }
    if (field.type === "url" && value.length > 0 && !zUrl(value)) {
      fieldErrors[field.name] = fieldError("Enter a valid URL.");
    }
    data[field.name] = value;
  }

  return { data, fieldErrors };
}

function zEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function zUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function submitApplication(
  _previousState: ApplicationFormState,
  formData: FormData,
): Promise<ApplicationFormState> {
  const typeValue = formData.get("type");
  if (
    typeof typeValue !== "string" ||
    !Object.values(ApplicationType).includes(typeValue as ApplicationType)
  ) {
    return { error: "Invalid application type." };
  }

  const type = typeValue as ApplicationType;
  const { data, fieldErrors } = validateSubmittedData(type, formData);
  if (Object.values(fieldErrors).some(Boolean)) {
    return { fieldErrors };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Create an account or sign in before submitting this application." };
  }

  try {
    const profilePhoto = formData.get("profilePhoto");
    if (profilePhoto instanceof File && profilePhoto.size > 0) {
      data.profilePhoto = await uploadProfilePhoto(profilePhoto, session.user.id);
    }
  } catch (error) {
    return {
      fieldErrors: {
        profilePhoto: [error instanceof Error ? error.message : "Profile picture upload failed."],
      },
    };
  }

  const submittedData = JSON.parse(JSON.stringify(data)) as Prisma.InputJsonObject;
  const application = await prisma.application.create({
    data: {
      applicantUserId: session.user.id,
      type,
      submittedData,
    },
    select: { id: true },
  });

  return { success: true, applicationId: application.id };
}
