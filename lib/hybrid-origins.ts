export function checkedOrigin(value: string, name: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error(`Invalid ${name}`);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "app", "proxy"].includes(url.hostname))) throw new Error(`Insecure ${name}`);
  return url.origin;
}

export function hybridOrigins(env = process.env) {
  const publicApp = checkedOrigin(env.PUBLIC_APP_ORIGIN || env.APP_ORIGIN || "http://127.0.0.1:3000", "PUBLIC_APP_ORIGIN");
  if (env.PUBLIC_APP_ORIGIN && env.APP_ORIGIN && checkedOrigin(env.APP_ORIGIN, "APP_ORIGIN") !== publicApp) throw new Error("APP_ORIGIN mismatch");
  const auth = checkedOrigin(env.AUTH_ORIGIN || publicApp, "AUTH_ORIGIN");
  // Host-only session and OIDC cookies must remain on the browser-facing origin.
  if (auth !== publicApp) throw new Error("AUTH_ORIGIN must equal PUBLIC_APP_ORIGIN");
  const backend = checkedOrigin(env.BACKEND_API_ORIGIN || `http://127.0.0.1:${env.PORT || 3000}`, "BACKEND_API_ORIGIN");
  return { publicApp, auth, backend, upload: checkedOrigin(env.UPLOAD_ORIGIN || backend, "UPLOAD_ORIGIN") };
}
