import { z } from "zod";
import { AthleteGender, PlayerStatus } from "@/generated/prisma/enums";

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === "" || z.email().safeParse(value).success, "Enter a valid email.");

export const athleteSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  gender: z.enum(AthleteGender),
  dateOfBirth: z.string().date(),
  dominantHand: z.string().trim().min(1).max(20),
  phone: z.string().trim().max(30),
  email: optionalEmail,
  emergencyContact: z.string().trim().max(120),
  previousTeam: z.string().trim().max(100),
  photoUrl: z.string().trim(),
  nationality: z.string().trim().max(60),
});

export const playerSchema = z.object({
  athleteId: z.string().min(1),
  seasonId: z.string().min(1, "Select a season."),
  seasonClubId: z.string(),
  position: z.string().trim().min(1).max(20),
  heightCm: z.coerce.number().int().min(120).max(260),
  weightKg: z.coerce.number().int().min(35).max(250),
  jerseyNumber: z
    .string()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= 999)),
  status: z.enum(PlayerStatus),
});

export type PlayerFormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};
