import { ApplicationType } from "@/generated/prisma/enums";

export type ApplicationField = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "url" | "number" | "textarea" | "checkbox" | "select" | "date" | "file";
  required?: boolean;
  placeholder?: string;
  description?: string;
  options?: string[];
};

export type ApplicationConfig = {
  type: ApplicationType;
  title: string;
  description: string;
  reviewNote: string;
  fields: ApplicationField[];
};

const profilePhotoField: ApplicationField = {
  name: "profilePhoto",
  label: "Profile picture",
  type: "file",
  required: true,
  description: "Basketball picture or profile photo. JPG, PNG, or WebP; maximum 5MB.",
};

const genderField: ApplicationField = {
  name: "gender",
  label: "Gender",
  type: "select",
  description: "Select the category you are applying under.",
  options: ["Male", "Female"],
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
      {
        name: "fullName",
        label: "Full name",
        required: true,
        description: "Enter your legal first and last name as it should appear on league records.",
        placeholder: "e.g. Tunde Adebayo",
      },
      profilePhotoField,
      {
        name: "dateOfBirth",
        label: "Date of birth",
        type: "date",
        required: true,
        description: "Used for eligibility checks. Use the format shown by your browser.",
      },
      {
        name: "phone",
        label: "Mobile",
        type: "tel",
        required: true,
        description: "Use a reachable mobile or WhatsApp number for combine and draft updates.",
        placeholder: "e.g. 08012345678",
      },
      { name: "email", label: "Email", type: "email", required: true },
      {
        name: "gender",
        label: "Gender",
        type: "select",
        description: "Select the division category you are applying under.",
        options: ["Male", "Female"],
      },
      {
        name: "heightFeet",
        label: "Height (in feet)",
        type: "number",
        required: true,
        description: "Enter height in feet. Decimals are allowed, for example 6.4.",
        placeholder: "e.g. 6.2",
      },
      {
        name: "wingspanFeet",
        label: "Wingspan (in feet)",
        type: "number",
        required: true,
        description: "Measure fingertip to fingertip with arms fully extended. Decimals are allowed.",
        placeholder: "e.g. 6.7",
      },
      {
        name: "location",
        label: "Location (state/city)",
        type: "select",
        required: true,
        description: "Select your current Nigerian state and city for scouting and event planning.",
        options: [
          "Abia - Umuahia",
          "Abia - Aba",
          "Adamawa - Yola",
          "Akwa Ibom - Uyo",
          "Anambra - Awka",
          "Anambra - Onitsha",
          "Bauchi - Bauchi",
          "Bayelsa - Yenagoa",
          "Benue - Makurdi",
          "Borno - Maiduguri",
          "Cross River - Calabar",
          "Delta - Asaba",
          "Delta - Warri",
          "Ebonyi - Abakaliki",
          "Edo - Benin City",
          "Ekiti - Ado Ekiti",
          "Enugu - Enugu",
          "FCT - Abuja",
          "Gombe - Gombe",
          "Imo - Owerri",
          "Jigawa - Dutse",
          "Kaduna - Kaduna",
          "Kano - Kano",
          "Katsina - Katsina",
          "Kebbi - Birnin Kebbi",
          "Kogi - Lokoja",
          "Kwara - Ilorin",
          "Lagos - Lagos Island",
          "Lagos - Lekki",
          "Lagos - Ikeja",
          "Lagos - Surulere",
          "Lagos - Yaba",
          "Lagos - Ajah",
          "Nasarawa - Lafia",
          "Niger - Minna",
          "Ogun - Abeokuta",
          "Ogun - Sango Ota",
          "Ondo - Akure",
          "Osun - Osogbo",
          "Oyo - Ibadan",
          "Plateau - Jos",
          "Rivers - Port Harcourt",
          "Sokoto - Sokoto",
          "Taraba - Jalingo",
          "Yobe - Damaturu",
          "Zamfara - Gusau",
        ],
      },
      {
        name: "academyTeam",
        label: "Academy/Team",
        description: "List your current academy, school, team, or training group if applicable.",
        placeholder: "e.g. Lagos Warriors Academy",
      },
      {
        name: "position",
        label: "Position",
        type: "select",
        description: "Select your primary basketball position.",
        options: ["Point guard", "Shooting guard", "Small forward", "Power forward", "Center"],
      },
      {
        name: "appearanceLinkOne",
        label: "Previous appearance / reel link 1",
        type: "url",
        description: "Optional. Paste a YouTube link, Facebook post, or reel showing a previous game, workout, or highlight.",
        placeholder: "https://youtube.com/...",
      },
      {
        name: "appearanceLinkTwo",
        label: "Previous appearance / reel link 2",
        type: "url",
        description: "Optional. Add a second YouTube link, Facebook post, or reel if available.",
        placeholder: "https://facebook.com/...",
      },
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
      profilePhotoField,
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      genderField,
      {
        name: "coachingExperience",
        label: "Coaching experience",
        type: "textarea",
        required: true,
        description: "Number of years.",
      },
      { name: "certifications", label: "Certifications", type: "textarea" },
      {
        name: "preferredDivision",
        label: "Preferred division",
        description: "Grassroots, Division 1, Division 2, or Pro.",
      },
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
      profilePhotoField,
      { name: "email", label: "Email", type: "email", required: true },
      { name: "phone", label: "Phone", type: "tel", required: true },
      genderField,
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
      genderField,
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
