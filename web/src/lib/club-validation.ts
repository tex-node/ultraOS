import { z } from "zod";
import { ClubBrandingStatus, ClubStatus, SeasonClubStatus } from "@/generated/prisma/enums";

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || z.url().safeParse(value).success, {
    message: "Enter a valid URL.",
  });

const optionalHexColor = z
  .string()
  .trim()
  .refine((value) => value === "" || /^#[0-9A-Fa-f]{6}$/.test(value), {
    message: "Use a 6-digit hex color or leave blank.",
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
  primaryColor: optionalHexColor,
  secondaryColor: optionalHexColor,
  brandingStatus: z.enum(ClubBrandingStatus),
  motto: z.string().trim().max(120, "Motto must be 120 characters or fewer."),
  publicBio: z.string().trim().max(1500, "Public biography must be 1,500 characters or fewer."),
  officialSlogan: z.string().trim().max(120, "Official slogan must be 120 characters or fewer."),
  crowdChant: z.string().trim().max(120, "Crowd chant must be 120 characters or fewer."),
  identityKeywords: z.string().trim().max(300, "Identity keywords must be 300 characters or fewer."),
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
