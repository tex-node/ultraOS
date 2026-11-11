import { redirect } from "next/navigation";

// Legacy portal home retired (D2): the discovery hub at `/` is the single fan home.
export const dynamic = "force-dynamic";

export default function PublicHome() {
  redirect("/");
}