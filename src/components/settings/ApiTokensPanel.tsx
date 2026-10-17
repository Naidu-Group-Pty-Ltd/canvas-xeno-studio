import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isMissingTableError } from "@/lib/edit/errors";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens.functions";
import { API_SCOPE_LABELS, API_SCOPES, type ApiScope } from "@/lib/studio-api/tokens";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TokenRow {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function useApiTokens(userId: string | null) {
  return useQuery({
    queryKey: ["api_tokens", userId],
    enabled: !!userId,
    queryFn: async (): Promise<{ supported: boolean; tokens: TokenRow[] }> => {
      const { data, error } = await supabase
        .from("api_tokens")
        .select("id,name,token_prefix,scopes,last_used_at,expires_at,revoked_at,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingTableError(error)) return { supported: false, tokens: [] };
        throw error;
      }
      return { supported: true, tokens: (data ?? []) as TokenRow[] };
    },
  });
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          onClick={() =>
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check className="mr-1 size-3" /> : <Copy className="mr-1 size-3" />}
          Copy
        </Button>
      </div>
      <pre className="overflow-x-auto rounded bg-muted/60 p-2 text-[11px] leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

/**
 * Personal tokens for the studio's API and MCP server: an agent or a script
 * does what you can do in the app, as you, within the token's scopes.
 */
export function ApiTokensPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useApiTokens(user?.id ?? null);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<ApiScope>>(new Set(["read"]));
  const [expires, setExpires] = useState<"0" | "30" | "90" | "365">("90");
  const [making, setMaking] = useState(false);
  const [made, setMade] = useState<{ token: string; name: string } | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading tokens…</p>;
  if (data && !data.supported)
    return (
      <p className="text-sm text-muted-foreground">
        The studio API needs a database update (migration 0019_studio_api). Until an admin applies
        it, no tokens can be made.
      </p>
    );

  const make = async () => {
    setMaking(true);
    try {
      const result = await createApiToken({
        data: {
          name: name.trim(),
          scopes: [...scopes],
          expiresInDays: Number(expires) as 0 | 30 | 90 | 365,
        },
      });
      setMade({ token: result.token, name: name.trim() });
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["api_tokens"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The token couldn't be made");
    } finally {
      setMaking(false);
    }
  };

  const revoke = async (token: TokenRow) => {
    try {
      await revokeApiToken({ data: { id: token.id } });
      await queryClient.invalidateQueries({ queryKey: ["api_tokens"] });
      toast.success(`“${token.name}” revoked: it stops working at once.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The token couldn't be revoked");
    }
  };

  const active = (data?.tokens ?? []).filter((token) => !token.revoked_at);
  const mcpConfig = (token: string) =>
    JSON.stringify(
      {
        mcpServers: {
          "xeno-studio": {
            type: "http",
            url: `${origin}/api/public/studio-mcp`,
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      },
      null,
      2,
    );

  return (
    <div className="space-y-4" data-testid="api-tokens">
      <p className="text-sm text-muted-foreground">
        Connect an agent (Claude, or any MCP client) or a script to the studio: it can find models
        and files, queue generations within your spending limits, make presenter videos and steer
        them, build edits in a brand's look and render them, as you. See docs/studio-api.md.
      </p>

      {made && (
        <div className="space-y-2 rounded-md border border-warning/50 bg-warning/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <KeyRound className="size-4" /> “{made.name}” is ready. Copy it now: it isn't shown
            again.
          </p>
          <CopyBlock label="Token" text={made.token} />
          <CopyBlock
            label="MCP server (e.g. Claude Code's .mcp.json)"
            text={mcpConfig(made.token)}
          />
          <CopyBlock
            label="Or plain HTTP"
            text={`curl -X POST ${origin}/api/public/studio/whoami -H "Authorization: Bearer ${made.token}"`}
          />
          <Button size="sm" variant="outline" onClick={() => setMade(null)}>
            Done
          </Button>
        </div>
      )}

      <ul className="space-y-1.5">
        {active.length === 0 && (
          <li className="text-sm text-muted-foreground">You have no API tokens.</li>
        )}
        {active.map((token) => (
          <li
            key={token.id}
            className="flex items-center gap-3 rounded-md border border-border p-2 text-sm"
          >
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {token.name}{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  {token.token_prefix}…
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {token.scopes.join(", ")} ·{" "}
                {token.last_used_at
                  ? `used ${formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true })}`
                  : "never used"}
                {token.expires_at
                  ? ` · ${new Date(token.expires_at) < new Date() ? "expired" : `expires ${formatDistanceToNow(new Date(token.expires_at), { addSuffix: true })}`}`
                  : ""}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void revoke(token)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 rounded-md border border-border p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="token-name">New token's name</Label>
            <Input
              id="token-name"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Claude Code on my laptop"
            />
          </div>
          <div className="space-y-1">
            <Label>Stops working</Label>
            <Select value={expires} onValueChange={(value) => setExpires(value as typeof expires)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">In 30 days</SelectItem>
                <SelectItem value="90">In 90 days</SelectItem>
                <SelectItem value="365">In a year</SelectItem>
                <SelectItem value="0">Never (until revoked)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          {API_SCOPES.map((scope) => (
            <label key={scope} className="flex items-start gap-2 text-xs">
              <Checkbox
                checked={scopes.has(scope)}
                onCheckedChange={(checked) => {
                  const next = new Set(scopes);
                  if (checked === true) next.add(scope);
                  else next.delete(scope);
                  setScopes(next);
                }}
                className="mt-0.5"
              />
              {API_SCOPE_LABELS[scope]}
            </label>
          ))}
        </div>
        <Button
          size="sm"
          onClick={() => void make()}
          disabled={making || !name.trim() || scopes.size === 0}
        >
          {making ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 size-3.5" />
          )}
          Make a token
        </Button>
      </div>
    </div>
  );
}
