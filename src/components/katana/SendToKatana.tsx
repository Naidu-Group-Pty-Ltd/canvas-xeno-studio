import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Sword } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKatanaEnabled, useSendToKatana } from "@/hooks/useKatana";
import type { CharacterEntry } from "@/hooks/useCharacters";
import {
  katanaChoices,
  type KatanaChoice,
  type KatanaFile,
  type KatanaSend,
} from "@/lib/katana/handoff";
import type { KatanaMode } from "@/lib/katana/messages";
import { cn } from "@/lib/utils";

/** How the button looks where it sits. */
type Look = "outline" | "icon" | "pill";

type TriggerProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  look: Look;
  label: string;
};

/** The button itself; a menu's trigger passes its own handlers through. */
const Trigger = forwardRef<HTMLButtonElement, TriggerProps>(function Trigger(
  { look, label, className, onClick, ...rest },
  ref,
) {
  const shared = {
    "data-testid": "send-to-katana",
    ...rest,
    ref,
    // A tile's own click (open the file) isn't this one.
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      onClick?.(event);
    },
  };
  if (look === "pill") {
    return (
      <button
        type="button"
        aria-label={label ? undefined : (rest.title ?? "Send to Katana")}
        {...shared}
        className={cn(
          "inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] disabled:opacity-50",
          className,
        )}
      >
        <Sword className="size-3" />
        {label}
      </button>
    );
  }
  if (look === "icon") {
    return (
      <Button
        variant="ghost"
        size="sm"
        aria-label={rest.title ?? "Send to Katana"}
        {...shared}
        className={cn("h-7 px-2", className)}
      >
        <Sword className="size-3.5" />
      </Button>
    );
  }
  return (
    <Button size="sm" variant="outline" {...shared} className={className}>
      <Sword className="mr-1.5 size-4" /> {label}
    </Button>
  );
});

/** A menu of ways something can go to Katana, or the one way when there's only one. */
function ChoiceMenu({
  choices,
  look,
  label,
  heading,
  className,
  onChoose,
}: {
  choices: KatanaChoice[];
  look: Look;
  label: string;
  heading: string;
  className?: string | undefined;
  onChoose: (choice: KatanaChoice) => void;
}) {
  if (choices.length === 1) {
    const [only] = choices;
    return (
      <Trigger
        look={look}
        label={label}
        className={className}
        title={`${only!.label}: ${only!.detail}`}
        onClick={() => onChoose(only!)}
      />
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Trigger look={look} label={label} className={className} title="Send to Katana" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs">{heading}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {choices.map((choice) => (
          <DropdownMenuItem
            key={choice.key}
            onClick={(event) => {
              event.stopPropagation();
              onChoose(choice);
            }}
            className="flex-col items-start gap-0.5"
            data-testid={`send-to-katana-${choice.key}`}
          >
            <span className="text-sm">{choice.label}</span>
            <span className="text-[11px] text-muted-foreground">{choice.detail}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * "Send to Katana" for a library file: a video as the footage to edit or the
 * reference to remix, an image among the images, a track as the soundtrack.
 * The characters in it can go along. Hidden while Katana is switched off.
 */
export function SendToKatana({
  file,
  characters,
  title,
  look = "outline",
  label = "Katana",
  className,
  onSent,
}: {
  file: KatanaFile;
  /** The team's characters in it, to keep in the run. */
  characters?: { id: string; name: string }[] | undefined;
  /** A title for the run, used when the form has none. */
  title?: string | null | undefined;
  look?: Look;
  label?: string;
  className?: string;
  /** Called before Katana opens (a dialog closes itself). */
  onSent?: () => void;
}) {
  const enabled = useKatanaEnabled();
  const send = useSendToKatana();
  const choices = katanaChoices(file, {
    ...(characters?.length ? { characters } : {}),
    ...(title ? { title } : {}),
  });
  if (!enabled || !choices.length) return null;
  return (
    <ChoiceMenu
      choices={choices}
      look={look}
      label={label}
      heading={file.title ? `Send “${file.title.slice(0, 40)}” to Katana` : "Send to Katana"}
      className={className}
      onChoose={(choice) => {
        onSent?.();
        send(choice.send);
      }}
    />
  );
}

/** A button for something already gathered (several clips and a brief): one way to Katana. */
export function SendBundleToKatana({
  send: bundle,
  disabledReason,
  label = "Send to Katana",
  look = "outline",
  className,
}: {
  send: KatanaSend | null;
  /** Why it can't go yet, shown instead of sending. */
  disabledReason?: string | null;
  label?: string;
  look?: Look;
  className?: string;
}): ReactNode {
  const enabled = useKatanaEnabled();
  const send = useSendToKatana();
  if (!enabled) return null;
  return (
    <Trigger
      look={look}
      label={label}
      className={className}
      disabled={!bundle || !!disabledReason}
      title={disabledReason ?? "Open Katana with these, to say how to edit them"}
      onClick={() => {
        if (bundle && !disabledReason) send(bundle);
      }}
    />
  );
}

const CHARACTER_MODES: { mode: KatanaMode; label: (name: string) => string; detail: string }[] = [
  {
    mode: "remix",
    label: (name) => `Remix a reference starring ${name}`,
    detail: "Katana remakes a reference edit (a TikTok, a Reel) with them as the hero.",
  },
  {
    mode: "preset",
    label: (name) => `A Katana preset starring ${name}`,
    detail: "One of Higgsfield's Katana presets, made with them.",
  },
  {
    mode: "edit",
    label: (name) => `Edit footage ${name} is in`,
    detail: "Katana edits your clips and keeps them looking like their sheet.",
  },
];

/**
 * A character into Katana: their reference sheet becomes the run's hero, and
 * their name and look go into its brief. Needs reference images to send.
 */
export function CharacterToKatana({
  character,
  className,
}: {
  character: CharacterEntry;
  className?: string;
}) {
  const enabled = useKatanaEnabled();
  const send = useSendToKatana();
  if (!enabled) return null;
  const sheet = character.images.filter((image) => image.role === "sheet").length;
  if (!sheet) {
    return (
      <Trigger
        look="outline"
        label="Use in Katana"
        className={className}
        disabled
        title="Add images to their reference sheet first: Katana keeps a likeness from them"
      />
    );
  }
  const choices: KatanaChoice[] = CHARACTER_MODES.map((entry) => ({
    key: entry.mode,
    label: entry.label(character.name),
    detail: entry.detail,
    send: { mode: entry.mode, characters: [{ id: character.id, name: character.name }] },
  }));
  return (
    <ChoiceMenu
      choices={choices}
      look="outline"
      label="Use in Katana"
      heading={`${character.name} in Katana`}
      className={className}
      onChoose={(choice) => send(choice.send)}
    />
  );
}
