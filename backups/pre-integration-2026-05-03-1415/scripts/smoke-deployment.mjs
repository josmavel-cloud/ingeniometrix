import process from "node:process";

const DEFAULT_BASE_URL = "http://127.0.0.1:3000";

function parseCookieName(setCookieValue) {
  const [cookiePair] = setCookieValue.split(";", 1);
  const separatorIndex = cookiePair.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  return cookiePair.slice(0, separatorIndex).trim();
}

function createSessionState() {
  return {
    cookies: new Map(),
  };
}

function getCookieHeader(state) {
  return Array.from(state.cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function rememberCookies(state, response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [response.headers.get("set-cookie")].filter(Boolean);

  for (const setCookie of setCookies) {
    const cookieName = parseCookieName(setCookie);

    if (!cookieName) {
      continue;
    }

    const [cookiePair] = setCookie.split(";", 1);
    const cookieValue = cookiePair.slice(cookieName.length + 1);
    state.cookies.set(cookieName, cookieValue);
  }
}

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    workspace: false,
  };

  for (const arg of argv) {
    if (arg === "--workspace") {
      options.workspace = true;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
    }
  }

  return options;
}

async function fetchStep(state, baseUrl, label, input) {
  const headers = new Headers(input.headers);

  if (input.body) {
    headers.set("content-type", "application/json");
  }

  const cookieHeader = getCookieHeader(state);
  if (cookieHeader) {
    headers.set("cookie", cookieHeader);
  }

  const response = await fetch(`${baseUrl}${input.path}`, {
    method: input.method ?? "GET",
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    redirect: "manual",
  });

  rememberCookies(state, response);

  const text = await response.text();
  const expectedStatus = input.expectStatus ?? null;
  const ok = expectedStatus === null ? response.ok : response.status === expectedStatus;

  return {
    label,
    ok,
    status: response.status,
    expectedStatus,
    path: input.path,
    method: input.method ?? "GET",
    location: response.headers.get("location"),
    bodyPreview: text.slice(0, 300),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sessionState = createSessionState();
  const results = [];

  results.push(
    await fetchStep(sessionState, options.baseUrl, "home_page", {
      path: "/",
    }),
  );

  results.push(
    await fetchStep(sessionState, options.baseUrl, "projects_requires_auth_redirect", {
      path: "/projects",
      expectStatus: 307,
    }),
  );

  if (options.workspace) {
    results.push(
      await fetchStep(sessionState, options.baseUrl, "auth_session_create", {
        path: "/api/auth/session",
        method: "POST",
        body: {
          email: "smoke.test@ingeniometrix.local",
          name: "Smoke Test",
        },
      }),
    );

    results.push(
      await fetchStep(
        sessionState,
        options.baseUrl,
        "projects_page_authenticated",
        {
          path: "/projects",
        },
      ),
    );

    results.push(
      await fetchStep(
        sessionState,
        options.baseUrl,
        "projects_api_list_authenticated",
        {
          path: "/api/projects",
        },
      ),
    );
  }

  const failed = results.filter((result) => !result.ok);

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: options.baseUrl,
        workspace: options.workspace,
        ok: failed.length === 0,
        results,
      },
      null,
      2,
    ),
  );

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
