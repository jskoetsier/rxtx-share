import { jwtDecode } from "jwt-decode";
import { NextRequest, NextResponse } from "next/server";
import Config, { ParsedConfigValue } from "./types/config.type";
import { parseConfigValue } from "./utils/parse-config-value";

// This middleware redirects based on different conditions:
// - Authentication state
// - Setup status
// - Admin privileges

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next).*)",
};

const CONFIG_CACHE_TTL_MS = Number(process.env.CONFIGS_CACHE_TTL_MS ?? "30000");
const CONFIG_FETCH_TIMEOUT_MS = Number(
  process.env.CONFIGS_FETCH_TIMEOUT_MS ?? "5000",
);

/** In-memory cache of `/api/configs` for the Node middleware runtime (not per-request). */
let configCache: { configs: Config[]; expiresAt: number } | null = null;

/**
 * Defaults aligned with `backend/prisma/seed/config.seed.ts` when the API is
 * down and there is no warm cache (cold start / outage).
 */
const CONFIG_FALLBACK_BY_KEY: Record<string, ParsedConfigValue> = {
  "share.allowRegistration": true,
  "share.allowUnauthenticatedShares": false,
  "smtp.enabled": false,
  "legal.enabled": false,
  "legal.imprintText": "",
  "legal.imprintUrl": "",
  "legal.privacyPolicyText": "",
  "legal.privacyPolicyUrl": "",
  "general.showHomePage": true,
};

async function loadConfigs(apiUrl: string): Promise<Config[]> {
  const now = Date.now();
  if (configCache && now < configCache.expiresAt) {
    return configCache.configs;
  }

  try {
    const response = await fetch(`${apiUrl}/api/configs`, {
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`configs HTTP ${response.status}`);
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body)) {
      throw new Error("configs response is not an array");
    }
    configCache = {
      configs: body as Config[],
      expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
    };
    return configCache.configs;
  } catch {
    if (configCache) {
      // Serve stale snapshot briefly; shorten refresh to avoid hammering a sick API.
      configCache = {
        ...configCache,
        expiresAt: Date.now() + Math.min(CONFIG_CACHE_TTL_MS, 10_000),
      };
      return configCache.configs;
    }
    return [];
  }
}

export async function middleware(request: NextRequest) {
  const routes = {
    unauthenticated: new Routes(["/auth/*", "/"]),
    public: new Routes([
      "/share/*",
      "/s/*",
      "/upload/*",
      "/error",
      "/imprint",
      "/privacy",
    ]),
    admin: new Routes(["/admin/*"]),
    account: new Routes(["/account*"]),
    disabled: new Routes([]),
  };

  const apiUrl = process.env.API_URL || "http://localhost:8080";
  const configList = await loadConfigs(apiUrl);

  const getConfig = (key: string): ParsedConfigValue => {
    try {
      if (configList.length > 0) {
        return parseConfigValue(key, configList);
      }
    } catch {
      /* fall through to fallback */
    }
    const fallback = CONFIG_FALLBACK_BY_KEY[key];
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error(`No config or fallback for ${key}`);
  };

  const route = request.nextUrl.pathname;
  let user: { isAdmin: boolean } | null = null;
  const accessToken = request.cookies.get("access_token")?.value;

  try {
    const claims = jwtDecode<{ exp: number; isAdmin: boolean }>(
      accessToken as string,
    );
    if (claims.exp * 1000 > Date.now()) {
      user = claims;
    }
  } catch {
    user = null;
  }

  if (!getConfig("share.allowRegistration")) {
    routes.disabled.routes.push("/auth/signUp");
  }

  if (getConfig("share.allowUnauthenticatedShares")) {
    routes.public.routes = ["*"];
  }

  if (!getConfig("smtp.enabled")) {
    routes.disabled.routes.push("/auth/resetPassword*");
  }

  if (!getConfig("legal.enabled")) {
    routes.disabled.routes.push("/imprint", "/privacy");
  } else {
    if (!getConfig("legal.imprintText") && !getConfig("legal.imprintUrl")) {
      routes.disabled.routes.push("/imprint");
    }
    if (
      !getConfig("legal.privacyPolicyText") &&
      !getConfig("legal.privacyPolicyUrl")
    ) {
      routes.disabled.routes.push("/privacy");
    }
  }

  // prettier-ignore
  const rules = [
    // Disabled routes
    {
      condition: routes.disabled.contains(route),
      path: "/",
    },
     // Authenticated state
     {
      condition: user && routes.unauthenticated.contains(route) && !getConfig("share.allowUnauthenticatedShares"),
      path: "/upload",
    },
    // Unauthenticated state
    {
      condition: !user && !routes.public.contains(route) && !routes.unauthenticated.contains(route),
      path: "/auth/signIn",
    },
    {
      condition: !user && routes.account.contains(route),
      path: "/upload",
    },
    // Admin privileges
    {
      condition: routes.admin.contains(route) && !user?.isAdmin,
      path: "/upload",
    },
    // Home page
    {
      condition: (!getConfig("general.showHomePage") || user) && route == "/",
      path: "/upload",
    },
    // Imprint redirect
    {
      condition: route == "/imprint" && !getConfig("legal.imprintText") && getConfig("legal.imprintUrl"),
      path: getConfig("legal.imprintUrl"),
    },
    // Privacy redirect
    {
      condition: route == "/privacy" && !getConfig("legal.privacyPolicyText") && getConfig("legal.privacyPolicyUrl"),
      path: getConfig("legal.privacyPolicyUrl"),
    },
  ];
  for (const rule of rules) {
    if (rule.condition) {
      let { path } = rule;

      if (path == "/auth/signIn") {
        path = path + "?redirect=" + encodeURIComponent(route);
      }
      return NextResponse.redirect(new URL(String(path), request.url));
    }
  }
}

// Helper class to check if a route matches a list of routes
class Routes {
  // eslint-disable-next-line no-unused-vars
  constructor(public routes: string[]) {}

  contains(_route: string) {
    for (const route of this.routes) {
      if (new RegExp("^" + route.replace(/\*/g, ".*") + "$").test(_route))
        return true;
    }
    return false;
  }
}
