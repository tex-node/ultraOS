"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { MediaStorageProvider } from "@/generated/prisma/enums";
import { r2CredentialsPresent, resolveMediaProvider, setMediaProvider } from "@/lib/system-config";

// Toggle the media storage provider (streak v18, Prompt 2).
//
// SUPER_ADMIN only, one key, two possible values. It REFUSES to switch to R2 when the credentials are absent - a toggle
// that silently writes every new asset to a provider that cannot accept them is how the original bug (everything local,
// nobody noticed) would come back wearing a different hat.
export async function setMediaProviderAction(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) throw new Error("Not signed in.");
  if (!session.user.roles.includes("SUPER_ADMIN")) throw new Error("Only a platform administrator can change the media provider.");

  const requested = String(formData.get("provider") ?? "");
  if (requested !== MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE && requested !== MediaStorageProvider.LOCAL_PERSISTENT_STORAGE) {
    throw new Error(`Unknown provider ${requested}.`);
  }
  if (requested === MediaStorageProvider.CLOUDFLARE_OBJECT_STORAGE) {
    const credentials = r2CredentialsPresent();
    if (!credentials.ready) {
      throw new Error(`R2 is not configured: missing ${credentials.missing.join(", ")}.`);
    }
  }

  await setMediaProvider(requested as MediaStorageProvider, session.user.id);
  revalidatePath("/admin/settings");
}

/** The state the settings page renders, including WHICH source answered. */
export async function loadMediaProviderState() {
  const resolved = await resolveMediaProvider();
  return { ...resolved, credentials: r2CredentialsPresent(), environmentValue: process.env.MEDIA_STORAGE_PROVIDER ?? null };
}
