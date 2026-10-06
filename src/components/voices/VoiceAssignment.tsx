import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Mic } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrandVoices } from "@/hooks/useVoiceData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const INHERIT = "inherit";

/** Picks a brand voice, or none to fall back to the next level (project, then studio default). */
export function BrandVoiceSelect({
  value,
  onChange,
  inheritLabel = "Studio default",
  className,
  id,
  disabled,
}: {
  value: string | null;
  onChange: (voiceId: string | null) => void;
  inheritLabel?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
}) {
  const { data: voices = [] } = useBrandVoices();
  return (
    <Select
      value={value ?? INHERIT}
      onValueChange={(next) => onChange(next === INHERIT ? null : next)}
      disabled={disabled ?? false}
    >
      <SelectTrigger id={id} aria-label="Brand voice" className={cn("h-8 text-xs", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>{inheritLabel}</SelectItem>
        {voices.map((voice) => (
          <SelectItem key={voice.id} value={voice.id}>
            {voice.name}
            {voice.is_default ? " (studio default)" : ""}
          </SelectItem>
        ))}
        {/* A voice that has since been archived still shows as the current choice. */}
        {value && !voices.some((voice) => voice.id === value) && (
          <SelectItem value={value}>Archived voice</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/**
 * The brand voice for a campaign or project. Every voiceover made for its
 * work speaks with this voice unless someone picks another one.
 */
export function VoiceAssignment({
  table,
  rowId,
  value,
  inheritLabel,
  className,
}: {
  table: "campaigns" | "projects";
  rowId: string;
  value: string | null | undefined;
  inheritLabel?: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { data: voices, error } = useBrandVoices();
  const [saving, setSaving] = useState(false);
  // Before the brand voice tables exist (or if they can't be read) there is nothing to pick.
  if (error || !voices) return null;

  async function assign(voiceId: string | null) {
    setSaving(true);
    const { error: updateError } = await supabase
      .from(table)
      .update({ brand_voice_id: voiceId })
      .eq("id", rowId);
    setSaving(false);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [table] }),
      queryClient.invalidateQueries({
        queryKey: table === "projects" ? ["project", rowId] : ["campaign", rowId],
      }),
      queryClient.invalidateQueries({ queryKey: ["brand-voice-for"] }),
    ]);
    toast.success(voiceId ? "Brand voice set" : "Using the default voice");
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link
        to="/voices"
        className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Mic className="size-3.5" /> Voice
      </Link>
      <BrandVoiceSelect
        value={value ?? null}
        onChange={(voiceId) => void assign(voiceId)}
        inheritLabel={
          inheritLabel ?? (table === "campaigns" ? "Project or studio default" : "Studio default")
        }
        disabled={saving}
        className="flex-1"
      />
    </div>
  );
}
