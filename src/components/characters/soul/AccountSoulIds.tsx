import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { CloudDownload, Fingerprint, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { importSoulId, listAccountSoulIds } from "@/lib/characters.functions";
import { SOUL_VERSION_LABELS, SOUL_VERSIONS, type SoulVersion } from "@/lib/characters/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Listed = Awaited<ReturnType<typeof listAccountSoulIds>>;

/**
 * The Soul IDs on the studio's Higgsfield account: each with the character
 * it belongs to here, or offered to take into this one (trained elsewhere,
 * or before the studio kept them). Reading the list is free, and settles any
 * unclear training whose Soul ID turns up there.
 */
export function AccountSoulIds({
  character,
  canEdit,
}: {
  character: CharacterEntry;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [listed, setListed] = useState<Listed | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, SoulVersion>>({});

  async function find() {
    setLoading(true);
    try {
      const result = await listAccountSoulIds();
      setListed(result);
      if (result.recovered)
        toast.success(
          `${result.recovered} unclear training${result.recovered === 1 ? "" : "s"} settled from the list`,
        );
      void queryClient.invalidateQueries({ queryKey: ["characters"] });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Higgsfield's list couldn't be read");
    } finally {
      setLoading(false);
    }
  }

  async function take(referenceId: string, known: SoulVersion | null) {
    setImporting(referenceId);
    try {
      await importSoulId({
        data: {
          characterId: character.id,
          referenceId,
          version: known ?? versions[referenceId] ?? "v2",
        },
      });
      toast.success(`Taken into ${character.name}`);
      await find();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "It couldn't be taken in");
    } finally {
      setImporting(null);
    }
  }

  return (
    <div className="space-y-2" data-testid="soul-account">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Soul IDs already on the studio's Higgsfield account can be taken into a character without
          training again.
        </p>
        <Button
          size="sm"
          variant="ghost"
          className="h-8"
          disabled={loading}
          onClick={() => void find()}
        >
          {loading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Search className="mr-1.5 size-3.5" />
          )}
          Find on Higgsfield
        </Button>
      </div>
      {listed && (
        <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">
          {!listed.souls.length && (
            <li className="text-muted-foreground">The account has no Soul IDs yet.</li>
          )}
          {listed.souls.map((soul) => (
            <li key={soul.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              {soul.thumbnailUrl ? (
                <img
                  src={soul.thumbnailUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="size-8 shrink-0 rounded object-cover"
                  onError={(event) => (event.currentTarget.style.display = "none")}
                />
              ) : (
                <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{soul.name ?? "Unnamed"}</p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {soul.modelVersion
                    ? SOUL_VERSION_LABELS[soul.modelVersion]
                    : "Soul model not given"}{" "}
                  ·{" "}
                  {soul.state === "ready"
                    ? "ready"
                    : soul.state === "failed"
                      ? "failed"
                      : "training"}
                  {soul.createdAt
                    ? ` · ${formatDistanceToNow(new Date(soul.createdAt), { addSuffix: true })}`
                    : ""}
                </p>
              </div>
              {soul.characterId ? (
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {soul.characterId === character.id ? "This character's" : soul.characterName}
                </Badge>
              ) : canEdit && soul.state === "ready" ? (
                <div className="flex shrink-0 items-center gap-1">
                  {!soul.modelVersion && (
                    <Select
                      value={versions[soul.id] ?? "v2"}
                      onValueChange={(value) =>
                        setVersions((current) => ({ ...current, [soul.id]: value as SoulVersion }))
                      }
                    >
                      <SelectTrigger className="h-7 w-28 text-xs" aria-label="Its Soul model">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SOUL_VERSIONS.map((version) => (
                          <SelectItem key={version} value={version}>
                            {SOUL_VERSION_LABELS[version]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={!!importing}
                    onClick={() => void take(soul.id, soul.modelVersion)}
                  >
                    {importing === soul.id ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <CloudDownload className="mr-1 size-3" />
                    )}
                    Take in
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
          {!listed.complete && (
            <li className="text-[11px] text-muted-foreground">
              Only the newest Soul IDs are shown.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
