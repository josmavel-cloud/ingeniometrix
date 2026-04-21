import { redirect } from "next/navigation";

import { HomeHero } from "@/components/marketing/home-hero";
import { getCurrentUser } from "@/server/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/projects");
  }

  return <HomeHero />;
}
