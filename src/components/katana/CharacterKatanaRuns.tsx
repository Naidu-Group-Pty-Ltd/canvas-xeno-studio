import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import type { CharacterEntry } from "@/hooks/useCharacters";
import { KatanaNotSetUp, useCharacterKatanaRuns, useKatanaEnabled } from "@/hooks/useKatana";
import { KatanaStatusBadge } from "./KatanaStatusBadge";

/** The Katana runs a character is in (through their sheet images), newest first. */
export function CharacterKatanaRuns({ character }: { character: CharacterEntry }) {
  const enabled = useKatanaEnabled();
  const { data: runs = [], isLoading, error } = useCharacterKatanaRuns(character.id);
  if (!enabled || error instanceof KatanaNotSetUp) return null;
  return (
    <section className="panel space-y-2 p-4" data-testid="character-katana-runs">
      <div>
        <h3 className="label-eyebrow">In Katana</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Katana videos that keep {character.name} the same, from their reference sheet. Use in
          Katana, above, starts another.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-16" />
      ) : error ? (
        <p className="text-xs text-muted-foreground">Their Katana runs couldn't be loaded.</p>
      ) : runs.length ? (
        <ul className="space-y-1.5">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                to="/katana/$runId"
                params={{ runId: run.id }}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:border-input"
              >
                <span className="min-w-0 truncate">{run.title || "Katana run"}</span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                  <KatanaStatusBadge status={run.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Not in a Katana video yet.</p>
      )}
    </section>
  );
}
