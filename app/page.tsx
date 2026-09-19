import type { Metadata } from "next";

import { HomeHero } from "@/components/marketing/home-hero";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return <HomeHero />;
}
