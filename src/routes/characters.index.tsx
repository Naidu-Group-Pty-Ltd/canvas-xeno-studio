import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Fingerprint, Loader2, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { MediaPreview } from "@/components/studio/MediaPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { characterCover, useCharacters, CharactersNotSetUp } from "@/hooks/useCharacters";
import { createCharacter } from "@/lib/characters.functions";
import { CHARACTER_LIMITS } from "@/lib/characters/model";
import { soulSummary } from "@/components/characters/labels";
import { isMissingTableError } from "@/lib/edit/errors";

export const Route = createFileRoute("/characters/")({
  head: () => ({
    meta: [
      { title: "Characters · Xeno Studio" },
      {
        name: "description",
        content: "People and mascots who look the same in every image and video.",
      },
      { property: "og:title", content: "Characters · Xeno Studio" },
      { property: "og:description", content: "Keep a character consistent across long videos." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: characters = [], isLoading, error } = useCharacters();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  // One character per press (Enter pressed twice, or Enter then a click).
  const lock = useRef(false);
  const missingTables = error instanceof CharactersNotSetUp || isMissingTableError(error);

  async function create() {
    if (!name.trim() || lock.current) return;
    lock.current = true;
    setSaving(true);
    try {
      const { id } = await createCharacter({ data: { name, description } });
      await queryClient.invalidateQueries({ queryKey: ["characters"] });
      setCreating(false);
      setName("");
      setDescription("");
      void navigate({ to: "/characters/$characterId", params: { characterId: id } });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "The character couldn't be created");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <AppShell title="Characters">
      <div className="space-y-5 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-2xl">
            <h2 className="font-display text-lg font-semibold">Characters</h2>
            <p className="text-sm text-muted-foreground">
              A character is a person or mascot who must look the same wherever they appear: their
              reference images, a short description of their look and, if you like, a Soul ID
              trained on Higgsfield. Add them to a long video and every clip keeps their face, hair
              and clothes, with keyframes and a check after each clip.
            </p>
          </div>
          <Button
            onClick={() => setCreating(true)}
            disabled={missingTables || !user}
            data-testid="new-character"
          >
            <Plus className="mr-1.5 size-4" /> New character
          </Button>
        </div>

        {missingTables && (
          <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div>
              <p className="font-medium">Characters need a database update.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Apply migration <code>0011_characters_and_keyframes</code> (drizzle/migrations),
                then reload.
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-64" />
            ))}
          </div>
        )}

        {!isLoading && !missingTables && characters.length === 0 && (
          <EmptyState
            icon={UserRound}
            title="No characters yet"
            description="Add the people who appear in your videos once. Every long video can then keep them looking the same from the first frame to the last."
            actionLabel="Create a character"
            onAction={() => setCreating(true)}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {characters.map((character) => {
            const cover = characterCover(character);
            const sheet = character.images.filter((image) => image.role === "sheet").length;
            const soul = soulSummary(character);
            return (
              <Link
                key={character.id}
                to="/characters/$characterId"
                params={{ characterId: character.id }}
                className="panel group flex flex-col overflow-hidden transition-colors hover:border-primary/40"
                data-testid="character-card"
              >
                <div className="relative aspect-square bg-surface">
                  {cover ? (
                    <MediaPreview
                      bucket={cover.storage_bucket}
                      path={cover.storage_path}
                      type="image"
                      alt={character.name}
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <UserRound className="size-8 opacity-40" />
                    </div>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <h3 className="truncate font-display text-sm font-semibold">{character.name}</h3>
                  <p className="line-clamp-2 min-h-8 text-xs text-muted-foreground">
                    {character.description || "No description yet."}
                  </p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>
                      {sheet} reference image{sheet === 1 ? "" : "s"}
                    </span>
                    {soul && (
                      <span className="inline-flex items-center gap-1">
                        <Fingerprint className="size-3 text-primary" /> {soul}
                      </span>
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <Dialog open={creating} onOpenChange={(open) => !saving && setCreating(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New character</DialogTitle>
            <DialogDescription>
              Name them now; add their images and look on the next page.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="character-name">Name</Label>
              <Input
                id="character-name"
                value={name}
                maxLength={CHARACTER_LIMITS.nameChars}
                placeholder="e.g. Mia"
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void create();
                }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="character-description">Their look (optional)</Label>
              <Textarea
                id="character-description"
                rows={3}
                value={description}
                maxLength={CHARACTER_LIMITS.descriptionChars}
                placeholder="Age, build, face, hair and clothes. The studio can write this from their images."
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void create()} disabled={saving || !name.trim()}>
              {saving && <Loader2 className="mr-1.5 size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
