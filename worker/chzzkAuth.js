const AUTH_BASE_URL = "https://chzzk.naver.com";
const API_BASE_URL = "https://openapi.chzzk.naver.com";
const STATE_COOKIE = "chzzk_oauth_state";
const SESSION_COOKIE = "chzzk_session";
const STATE_MAX_AGE_SECONDS = 600;
const SESSION_MAX_AGE_SECONDS = 86400;

export async function handleChzzkAuth(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/auth/chzzk/start") {
    return startAuth(request, env);
  }

  if (url.pathname === "/api/auth/chzzk/callback") {
    return finishAuth(request, env);
  }

  if (url.pathname === "/api/auth/me") {
    const session = await readChzzkSession(request, env);
    return Response.json({
      ok: true,
      authenticated: Boolean(session),
      user: session
        ? {
            channelId: session.channelId,
            channelName: session.channelName,
            followerCount: session.followerCount,
            minFollowers: minFollowers(env),
          }
        : null,
    });
  }

  if (url.pathname === "/api/auth/logout") {
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": expiredCookie(SESSION_COOKIE) } },
    );
  }

  return null;
}

export async function readChzzkSession(request, env) {
  const token = cookies(request).get(SESSION_COOKIE);
  if (!token) return null;

  const payload = await verifySignedValue(token, env.CHZZK_SESSION_SECRET);
  if (!payload || payload.expiresAt <= Date.now()) return null;
  if (!payload.allowed || Number(payload.followerCount) < minFollowers(env)) return null;
  return payload;
}

async function startAuth(request, env) {
  const configError = authConfigError(env);
  if (configError) return configError;

  const state = crypto.randomUUID();
  const redirectUri = callbackUrl(request);
  const authUrl = new URL("/account-interlock", AUTH_BASE_URL);
  authUrl.searchParams.set("clientId", env.CHZZK_CLIENT_ID);
  authUrl.searchParams.set("redirectUri", redirectUri);
  authUrl.searchParams.set("state", state);

  const stateCookie = await signedCookie(STATE_COOKIE, { state, expiresAt: Date.now() + STATE_MAX_AGE_SECONDS * 1000 }, env.CHZZK_SESSION_SECRET, {
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  return redirectWithCookies(authUrl.toString(), [stateCookie]);
}

async function finishAuth(request, env) {
  const configError = authConfigError(env);
  if (configError) return configError;

  const url = new URL(request.url);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  const expected = await verifySignedValue(cookies(request).get(STATE_COOKIE), env.CHZZK_SESSION_SECRET);
  if (!code || !state || !expected || expected.state !== state || expected.expiresAt <= Date.now()) {
    return redirectWithAuthError(request, "invalid_state");
  }

  try {
    const token = await exchangeCodeForToken(request, env, code, state);
    const me = await fetchCurrentUser(token.accessToken);
    const channel = await fetchChannel(env, me.channelId);
    const followerCount = Number(channel.followerCount || 0);
    const allowed = followerCount >= minFollowers(env);

    if (!allowed) {
      return redirectWithAuthError(request, "not_enough_followers", [
        expiredCookie(STATE_COOKIE),
        expiredCookie(SESSION_COOKIE),
      ]);
    }

    const sessionCookie = await signedCookie(
      SESSION_COOKIE,
      {
        allowed: true,
        channelId: me.channelId,
        channelName: me.channelName || channel.channelName || "",
        followerCount,
        expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
      },
      env.CHZZK_SESSION_SECRET,
      { maxAge: SESSION_MAX_AGE_SECONDS },
    );

    return redirectHome(request, [expiredCookie(STATE_COOKIE), sessionCookie]);
  } catch (error) {
    return redirectWithAuthError(request, "auth_failed");
  }
}

async function exchangeCodeForToken(request, env, code, state) {
  const response = await fetch(`${API_BASE_URL}/auth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grantType: "authorization_code",
      clientId: env.CHZZK_CLIENT_ID,
      clientSecret: env.CHZZK_CLIENT_SECRET,
      code,
      state,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.content?.accessToken) {
    throw new Error("token_exchange_failed");
  }
  return payload.content;
}

async function fetchCurrentUser(accessToken) {
  const response = await fetch(`${API_BASE_URL}/open/v1/users/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json();
  if (!response.ok || !payload.content?.channelId) {
    throw new Error("user_fetch_failed");
  }
  return payload.content;
}

async function fetchChannel(env, channelId) {
  const url = new URL("/open/v1/channels", API_BASE_URL);
  url.searchParams.append("channelIds", channelId);
  const response = await fetch(url.toString(), {
    headers: {
      "Client-Id": env.CHZZK_CLIENT_ID,
      "Client-Secret": env.CHZZK_CLIENT_SECRET,
      "Content-Type": "application/json",
    },
  });
  const payload = await response.json();
  const channel = payload.content?.data?.[0];
  if (!response.ok || !channel) {
    throw new Error("channel_fetch_failed");
  }
  return channel;
}

function authConfigError(env) {
  if (!env.CHZZK_CLIENT_ID || !env.CHZZK_CLIENT_SECRET || !env.CHZZK_SESSION_SECRET) {
    return Response.json({ ok: false, code: "missing_chzzk_auth_config" }, { status: 500 });
  }
  return null;
}

function minFollowers(env) {
  const value = Number(env.MIN_CHZZK_FOLLOWERS);
  return Number.isFinite(value) && value > 0 ? value : 500;
}

function callbackUrl(request) {
  const url = new URL(request.url);
  url.pathname = "/api/auth/chzzk/callback";
  url.search = "";
  return url.toString();
}

function redirectHome(request, setCookies = []) {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  return redirectWithCookies(url.toString(), setCookies);
}

function redirectWithAuthError(request, code, setCookies = []) {
  const url = new URL(request.url);
  url.pathname = "/";
  url.search = "";
  url.searchParams.set("authError", code);
  return redirectWithCookies(url.toString(), setCookies);
}

function redirectWithCookies(location, setCookies) {
  const headers = new Headers({ Location: location });
  for (const cookie of setCookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

async function signedCookie(name, payload, secret, options = {}) {
  return `${name}=${await signValue(payload, secret)}; Path=/; Max-Age=${options.maxAge || SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

function expiredCookie(name) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

async function signValue(payload, secret) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(body, secret);
  return `${body}.${signature}`;
}

async function verifySignedValue(value, secret) {
  if (!value || !secret) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body, secret);
  if (!timingSafeEqual(signature, expected)) return null;

  try {
    return JSON.parse(base64UrlDecode(body));
  } catch {
    return null;
  }
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function cookies(request) {
  const result = new Map();
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name) result.set(name, value.join("="));
  }
  return result;
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
