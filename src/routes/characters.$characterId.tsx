import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ArrowLeft, Loader2, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { CharacterImages } from "@/components/characters/CharacterImages";
import { SoulIdPanel } from "@/components/characters/SoulIdPanel";
import { ViewsMaker } from "@/components/characters/ViewsMaker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useCharacter, type CharacterEntry } from "@/hooks/useCharacters";
import { archiveCharacter, describeCharacter, updateCharacter } from "@/lib/characters.functions";
import { CHARACTER_LIMITS } from "@/lib/characters/model";

export const Route = createFileRoute("/characters/$characterId")({
  head: () => ({
    meta: [
      { title: "Character · Xeno Studio" },
      { name: "description", content: "A character's reference sheet, look and Soul ID." },
    ],
  }),
  component: CharacterPage,
});

function CharacterPage() {
  const { characterId } = Route.useParams();
  const { user, isAdmin } = useAuth();
  const { data: character, isLoading } = useCharacter(characterId);
  const canEdit = !!user && !!character && (character.created_by === user.id || isAdmin);

  return (
    <AppShell title={character?.name ?? "Character"}>
      <div className="space-y-4 p-4">
        <Link
          to="/characters"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Characters
        </Link>
        {isLoading ? (
          <Skeleton className="h-96" />
        ) : !character ? (
          <EmptyState
            icon={UserRound}
            title="This character isn't here"
            description="It may have been removed. Characters you can use are on the Characters page."
          />
        ) : (
          <CharacterEditor character={character} canEdit={canEdit} />
        )}
      </div>
    </AppShell>
  );
}

function CharacterEditor({ character, canEdit }: { character: CharacterEntry; canEdit: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(character.name);
  const [description, setDescription] = useState(character.description);
  const [savedDescription, setSavedDescription] = useState(character.description);
  const [busy, setBusy] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Saved elsewhere (or by the AI): shown here unless being edited.
  useEffect(() => setName(character.name), [character.name]);
  useEffect(() => {
    setDescription((current) => (current === savedDescription ? character.description : current));
    setSavedDescription(character.description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.description]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["characters"] });

  async function run(label: string, work: () => Promise<unknown>, success?: string) {
    setBusy(label);
    try {
      await work();
      await refresh();
      if (success) toast.success(success);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "That didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function saveName() {
    const clean = name.trim();
    if (!clean || clean === character.name) {
      setName(character.name);
      return;
    }
    void run("name", () => updateCharacter({ data: { characterId: character.id, name: clean } }));
  }

  const descriptionChanged = description.trim() !== character.description.trim();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Input
            value={name}
            maxLength={CHARACTER_LIMITS.nameChars}
            onChange={(event) => setName(event.target.value)}
            onBlur={saveName}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            className="h-10 max-w-sm font-display text-lg font-semibold"
            aria-label="Name"
          />
        ) : (
          <h2 className="font-display text-lg font-semibold">{character.name}</h2>
        )}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs text-muted-foreground"
            onClick={() => setArchiving(true)}
          >
            <Archive className="mr-1.5 size-3.5" /> Remove character
          </Button>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <section className="panel space-y-2 p-4" data-testid="character-look">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="max-w-xl">
                <h3 className="label-eyebrow">Their look</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Added to every clip and keyframe they're in: age, build, face, hair and clothes,
                  in a sentence or two. Name what must never change.
                </p>
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={busy !== null || character.images.length === 0 || descriptionChanged}
                  title={
                    !character.images.length
                      ? "Add images of the character first"
                      : descriptionChanged
                        ? "Save or undo your changes to their look first"
                        : undefined
                  }
                  onClick={() =>
                    void run(
                      "describe",
                      async () => {
                        const result = await describeCharacter({
                          data: { characterId: character.id },
                        });
                        setDescription(result.description);
                      },
                      "Described from their images. Check it and change anything that's off.",
                    )
                  }
                  data-testid="character-describe"
                >
                  {busy === "describe" ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 size-3.5 text-primary" />
                  )}
                  Describe with AI
                </Button>
              )}
            </div>
            {canEdit ? (
              <>
                <Textarea
                  rows={3}
                  value={description}
                  maxLength={CHARACTER_LIMITS.descriptionChars}
                  placeholder="e.g. Woman in her early 30s, slim, olive skin, shoulder-length wavy auburn hair, green eyes; navy wool coat over a white shirt, dark jeans, white trainers."
                  onChange={(event) => setDescription(event.target.value)}
                  className="text-sm"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {description.length}/{CHARACTER_LIMITS.descriptionChars}
                  </span>
                  <Button
                    size="sm"
                    disabled={busy !== null || !descriptionChanged}
                    onClick={() =>
                      void run(
                        "save",
                        () =>
                          updateCharacter({
                            data: { characterId: character.id, description },
                          }),
                        "Saved.",
                      )
                    }
                  >
                    {busy === "save" && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                    Save
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm">{character.description || "No description yet."}</p>
            )}
          </section>

          <CharacterImages character={character} role="sheet" canEdit={canEdit} />
          <CharacterImages character={character} role="photo" canEdit={canEdit} />
        </div>

        <div className="space-y-4">
          <ViewsMaker character={character} canEdit={canEdit} />
          <SoulIdPanel character={character} canEdit={canEdit} />
        </div>
      </div>

      <AlertDialog open={archiving} onOpenChange={setArchiving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {character.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They leave the Characters page and can't be added to new videos. Their images stay in
              the library, and videos already made with them aren't changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void run("archive", async () => {
                  await archiveCharacter({ data: { characterId: character.id } });
                  void navigate({ to: "/characters" });
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
