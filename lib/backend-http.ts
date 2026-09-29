import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hybridOrigins } from "./hybrid-origins";
import type { PageContract } from "./hybrid-contracts";

// Server-component HTTP adapter. Identity is always resolved by Ubuntu.
export async function pageData<K extends keyof PageContract>(kind: K, id?: string): Promise<PageContract[K]> {
  const token = (await cookies()).get("imx_session")?.value;
  const url = new URL(`/api/ui/${kind}${id ? `/${encodeURIComponent(id)}` : ""}`, hybridOrigins().backend);
  const response = await fetch(url, {
    cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(30_000),
    headers: token ? { cookie: `imx_session=${encodeURIComponent(token)}` } : {},
  });
  if (response.status === 401) redirect("/workspace");
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Backend temporarily unavailable");
  return response.json() as Promise<PageContract[K]>;
}
export const getCurrentUser = () => pageData("session");
export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/workspace");
  return user;
}
