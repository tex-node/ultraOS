import { ApplicationType } from "@/generated/prisma/enums";

export type ApplicationField = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "number" | "textarea" | "checkbox";
  required?: boolean;
  placeholder?: string;
};

export type ApplicationConfig = {
  type: ApplicationType;
  title: string;
  description: string;
  reviewNote: string;
  fields: ApplicationField[];
};

export const applicationConfigs: Record<ApplicationType, ApplicationConfig> = {
  PLAYER: {
    type: ApplicationType.PLAYER,
    title: "Player application",
    description:
      "Submit athlete details for draft eligibility and season registration review.",
    reviewNote:
      "Approval marks the athlete for controlled player registration and draft processing.",
    fields: [
      { name: "firstName", label: "First name", required: true },
      { name: "lastName", label: "Last name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "dateOfBirth", label: "Date of birth", required: true },
      { name: "genderDivision", label: "Gender / division", required: true },
      { name: "position", label: "Position", required: true },
      { name: "heightCm", label: "Height (cm)", type: "number", required: true },
      { name: "weightKg", label: "Weight (kg)", type: "number", required: true },
      { name: "previousTeam", label: "Previous team" },
      { name: "highlightVideoUrl", label: "Highlight video link", type: "url" },
      { name: "emergencyContact", label: "Emergency contact", type: "textarea", required: true },
      { name: "medicalNotes", label: "Medical notes", type: "textarea" },
      { name: "consentWaiver", label: "I confirm consent and waiver acknowledgement.", type: "checkbox", required: true },
      { name: "draftEligibility", label: "I want to be considered draft eligible.", type: "checkbox" },
    ],
  },
  COACH: {
    type: ApplicationType.COACH,
    title: "Coach application",
    description: "Apply for coach review before any staff role is assigned.",
    reviewNote: "Approval allows an operator to create/link a Staff profile and assign coach access.",
    fields: [
      { name: "name", label: "Full name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "coachingExperience", label: "Coaching experience", type: "textarea", required: true },
      { name: "certifications", label: "Certifications", type: "textarea" },
      { name: "preferredDivision", label: "Preferred division" },
      { name: "availability", label: "Availability", type: "textarea", required: true },
      { name: "references", label: "References", type: "textarea" },
    ],
  },
  SCOUT: {
    type: ApplicationType.SCOUT,
    title: "Scout application",
    description: "Apply for scouting access without receiving automatic scout permissions.",
    reviewNote: "Approval allows an operator to create/link a Staff profile and assign scout access.",
    fields: [
      { name: "name", label: "Full name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "basketballBackground", label: "Basketball background", type: "textarea", required: true },
      { name: "affiliation", label: "Organization / club affiliation" },
      { name: "scoutingRegion", label: "Scouting region", required: true },
      { name: "portfolioUrl", label: "Portfolio link", type: "url" },
      { name: "references", label: "References", type: "textarea" },
      { name: "conflictDeclaration", label: "Conflict-of-interest declaration", type: "textarea", required: true },
    ],
  },
  OFFICIAL: {
    type: ApplicationType.OFFICIAL,
    title: "Official application",
    description: "Apply to work games as an official or referee.",
    reviewNote: "Approval keeps official assignment under league operator control.",
    fields: [
      { name: "name", label: "Full name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "refereeExperience", label: "Referee experience", type: "textarea", required: true },
      { name: "certifications", label: "Certifications", type: "textarea" },
      { name: "availability", label: "Availability", type: "textarea", required: true },
      { name: "preferredEvents", label: "Preferred events", type: "textarea" },
    ],
  },
  MEDIA: {
    type: ApplicationType.MEDIA,
    title: "Media application",
    description: "Request media accreditation review.",
    reviewNote: "Approval allows event accreditation to be issued by an operator.",
    fields: [
      { name: "name", label: "Full name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "organization", label: "Organization", required: true },
      { name: "mediaRole", label: "Role", required: true },
      { name: "equipment", label: "Equipment", type: "textarea" },
      { name: "coveragePurpose", label: "Coverage purpose", type: "textarea", required: true },
      { name: "socialLinks", label: "Social links", type: "textarea" },
    ],
  },
  VENDOR: {
    type: ApplicationType.VENDOR,
    title: "Vendor application",
    description: "Apply to sell products at Ultra events.",
    reviewNote: "Approval allows a Vendor record and products to be created by an operator.",
    fields: [
      { name: "businessName", label: "Business name", required: true },
      { name: "contactName", label: "Contact person", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "products", label: "Products", type: "textarea", required: true },
      { name: "foodHandlingInfo", label: "Food handling info", type: "textarea" },
      { name: "eventAvailability", label: "Event availability", type: "textarea", required: true },
    ],
  },
  VOLUNTEER: {
    type: ApplicationType.VOLUNTEER,
    title: "Volunteer application",
    description: "Apply to support Ultra events and operations.",
    reviewNote: "Approval allows operators to assign event responsibilities manually.",
    fields: [
      { name: "name", label: "Full name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      { name: "areaOfInterest", label: "Area of interest", required: true },
      { name: "availability", label: "Availability", type: "textarea", required: true },
      { name: "experience", label: "Relevant experience", type: "textarea" },
    ],
  },
};

export const applicationCards = [
  { href: "/apply/player", type: ApplicationType.PLAYER, label: "Apply as Player" },
  { href: "/apply/coach", type: ApplicationType.COACH, label: "Apply as Coach" },
  { href: "/apply/scout", type: ApplicationType.SCOUT, label: "Apply as Scout" },
  { href: "/apply/official", type: ApplicationType.OFFICIAL, label: "Apply as Official" },
  { href: "/apply/media", type: ApplicationType.MEDIA, label: "Apply as Media" },
  { href: "/apply/vendor", type: ApplicationType.VENDOR, label: "Apply as Vendor" },
  { href: "/apply/volunteer", type: ApplicationType.VOLUNTEER, label: "Apply as Volunteer" },
];

export const applySlugToType: Record<string, ApplicationType> = {
  player: ApplicationType.PLAYER,
  coach: ApplicationType.COACH,
  scout: ApplicationType.SCOUT,
  official: ApplicationType.OFFICIAL,
  media: ApplicationType.MEDIA,
  vendor: ApplicationType.VENDOR,
  volunteer: ApplicationType.VOLUNTEER,
};
