import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  accountFromClaims,
  allowedReturnOrigin,
  authorizeUrl,
  base64Url,
  decodeJwtClaims,
  pkceChallenge,
  readTokenResponse,
} from "../../src/lib/katana/oauth";
import {
  KATANA_FREE_TOOLS,
  KATANA_GUARDED_TOOLS,
  KATANA_SYSTEM_PROMPT,
  isGuardedTool,
  katanaAgentConfig,
} from "../../src/lib/katana/agent";

const APP = "https://project--2a4921ec-3e39-43b5-8d85-e5ba53b7eb5e.lovable.app";

describe("oauth", () => {
  test("the PKCE challenge is the unpadded base64url SHA-256 of the verifier", async () => {
    const verifier = "dBjftJeZ4CVP-mJ92K9qXmXW1fdcMwknCz3k3WhtL8vY";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(await pkceChallenge(verifier)).toBe(expected);
    expect(expected).not.toMatch(/[=+/]/);
  });

  test("base64Url has no padding or unsafe characters", () => {
    expect(base64Url(new Uint8Array([251, 255, 254]))).toBe("-__-");
  });

  test("the authorize URL carries PKCE, the scopes and the MCP resource", () => {
    const url = new URL(
      authorizeUrl({
        authorizationEndpoint: "https://clerk.higgsfield.ai/oauth/authorize",
        clientId: "client_1",
        redirectUri: `${APP}/api/public/higgsfield-oauth`,
        scopes: ["openid", "email", "offline_access"],
        state: "s".repeat(32),
        codeChallenge: "challenge",
        resource: "https://mcp.higgsfield.ai/mcp",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://clerk.higgsfield.ai/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client_1",
      redirect_uri: `${APP}/api/public/higgsfield-oauth`,
      scope: "openid email offline_access",
      state: "s".repeat(32),
      code_challenge: "challenge",
      code_challenge_method: "S256",
      resource: "https://mcp.higgsfield.ai/mcp",
    });
  });

  test("an admin is only ever sent back to a studio address", () => {
    expect(allowedReturnOrigin("https://canvas-xeno-studio.lovable.app", APP)).toBe(
      "https://canvas-xeno-studio.lovable.app",
    );
    expect(allowedReturnOrigin("https://id-preview--abc.lovable.app", APP)).toBe(
      "https://id-preview--abc.lovable.app",
    );
    expect(allowedReturnOrigin("http://localhost:3000", APP)).toBe("http://localhost:3000");
    expect(allowedReturnOrigin("https://evil.example", APP)).toBe(APP);
    expect(allowedReturnOrigin("https://lovable.app.evil.example", APP)).toBe(APP);
    expect(allowedReturnOrigin("http://canvas-xeno-studio.lovable.app", APP)).toBe(APP);
    expect(allowedReturnOrigin("not a url", APP)).toBe(APP);
    expect(allowedReturnOrigin(null, APP)).toBe(APP);
  });

  test("token responses", () => {
    const now = Date.parse("2026-10-16T08:00:00.000Z");
    expect(
      readTokenResponse(
        { access_token: "a", refresh_token: "r", expires_in: 3600, scope: "openid", id_token: "i" },
        now,
      ),
    ).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: "2026-10-16T09:00:00.000Z",
      scope: "openid",
      idToken: "i",
    });
    expect(readTokenResponse({ access_token: "a" }, now)).toEqual({
      accessToken: "a",
      refreshToken: null,
      expiresAt: null,
      scope: null,
      idToken: null,
    });
    expect(readTokenResponse({ error: "invalid_grant" })).toBeNull();
  });

  test("the account is read from the ID token", () => {
    const payload = btoa(
      JSON.stringify({
        sub: "user_1",
        email: "team@example.com",
        given_name: "Ada",
        family_name: "L",
      }),
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const claims = decodeJwtClaims(`header.${payload}.signature`);
    expect(accountFromClaims(claims)).toEqual({
      email: "team@example.com",
      name: "Ada L",
      subject: "user_1",
    });
    expect(decodeJwtClaims("not-a-jwt")).toBeNull();
    expect(accountFromClaims(null)).toEqual({ email: null, name: null, subject: null });
  });
});

describe("the Katana agent", () => {
  const config = katanaAgentConfig({ model: "claude-opus-5-5", effort: "high" });
  const mcp = config.tools?.find((tool) => tool.type === "mcp_toolset");
  const builtIn = config.tools?.find((tool) => tool.type === "agent_toolset_20260401");

  test("it reaches only Higgsfield's MCP server", () => {
    expect(config.mcp_servers).toEqual([
      { type: "url", name: "higgsfield", url: "https://mcp.higgsfield.ai/mcp" },
    ]);
    expect(config.model).toEqual({ id: "claude-opus-5-5", effort: "high" });
  });

  test("every paid tool waits for the guard; everything else is allowed by name only", () => {
    expect(mcp && "default_config" in mcp ? mcp.default_config : null).toEqual({
      enabled: false,
      permission_policy: { type: "always_ask" },
    });
    const configs = mcp && "configs" in mcp ? (mcp.configs ?? []) : [];
    for (const name of KATANA_GUARDED_TOOLS) {
      expect(configs.find((entry) => entry.name === name)?.permission_policy).toEqual({
        type: "always_ask",
      });
      expect(isGuardedTool(name)).toBe(true);
    }
    for (const name of KATANA_FREE_TOOLS) {
      expect(configs.find((entry) => entry.name === name)?.permission_policy).toEqual({
        type: "always_allow",
      });
      expect(isGuardedTool(name)).toBe(false);
    }
    expect(configs).toHaveLength(KATANA_FREE_TOOLS.length + KATANA_GUARDED_TOOLS.length);
    expect(
      KATANA_FREE_TOOLS.some((name) => (KATANA_GUARDED_TOOLS as readonly string[]).includes(name)),
    ).toBe(false);
  });

  test("its own container can only read (no shell, no web)", () => {
    expect(builtIn && "default_config" in builtIn ? builtIn.default_config?.enabled : null).toBe(
      false,
    );
    const configs = builtIn && "configs" in builtIn ? (builtIn.configs ?? []) : [];
    expect(configs.map((entry) => entry.name).sort()).toEqual(["glob", "grep", "read"]);
  });

  test("its prompt asks for the lines the studio reads", () => {
    expect(KATANA_SYSTEM_PROMPT).toContain("XENO_RESULT media_id=");
    expect(KATANA_SYSTEM_PROMPT).toContain("XENO_RESULT none reason=");
    expect(KATANA_SYSTEM_PROMPT).toContain("get_workflow_instructions");
  });
});
