export const PUBLIC_SITE_NAME = "Ingeniometrix";

export const PUBLIC_SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ingeniometrix.com"
).replace(/\/+$/, "");

export function getPublicUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${PUBLIC_SITE_URL}${normalizedPath}`;
}
