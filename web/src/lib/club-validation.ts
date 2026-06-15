import { z } from "zod";
import { ClubStatus, SeasonClubStatus } from "@/generated/prisma/enums";

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || z.url().safeParse(value).success, {
    message: "Enter a valid URL.",
  });

export const clubSchema = z.object({
  sportId: z.string().min(1, "Select a sport."),
  name: z.string().trim().min(2, "Name must contain at least 2 characters.").max(80),
  shortName: z
    .string()
    .trim()
    .min(2, "Short name must contain at least 2 characters.")
    .max(8)
    .transform((value) => value.toUpperCase()),
  logoUrl: optionalUrl,
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex color."),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex color."),
  foundedYear: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (Number.isInteger(Number(value)) &&
          Number(value) >= 1800 &&
          Number(value) <= new Date().getFullYear()),
      "Enter a valid founding year.",
    ),
  status: z.enum(ClubStatus),
  websiteUrl: optionalUrl,
});

export const seasonClubSchema = z.object({
  clubId: z.string().min(1, "Select a club."),
  seasonId: z.string().min(1, "Select a season."),
  divisionId: z.string().min(1, "Select a division."),
  headCoachId: z.string(),
  assistantCoachId: z.string(),
  teamManagerId: z.string(),
  scoutId: z.string(),
  fanCaptainId: z.string(),
  status: z.enum(SeasonClubStatus),
});

export type ClubFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export function formDataToRecord(formData: FormData) {
  return Object.fromEntries(formData.entries());
}
