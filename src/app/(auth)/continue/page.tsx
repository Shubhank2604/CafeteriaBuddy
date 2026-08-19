import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPrefs } from "@/lib/services";

/**
 * Post-login landing. Used after a full browser navigation so the session
 * cookie is definitely attached (client router.push races the cookie).
 */
export default async function ContinuePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?error=session");
  }

  if (session.user.isAdmin) {
    redirect("/admin");
  }

  const prefs = getPrefs(session.user.id);
  if (!prefs?.onboardingCompleted) {
    redirect("/onboarding");
  }

  redirect("/today");
}
