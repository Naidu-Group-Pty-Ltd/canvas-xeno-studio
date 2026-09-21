import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { EmptyState } from "@/components/studio/EmptyState";
import { OPERATION_LABELS } from "@/components/create/ModelBrowser";
import { useModels } from "@/hooks/useStudioData";
import { useAuth } from "@/hooks/useAuth";
import type { ModelRegistryEntry } from "@/lib/model-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/models")({
  head: () => ({
    meta: [
      { title: "Models · Xeno Studio" },
      { name: "description", content: "The model registry powering every generation control in the studio." },
      { property: "og:title", content: "Models · Xeno Studio" },
      { property: "og:description", content: "Configured image and video models available to the team." },
    ],
  }),
  component: ModelsPage,
});

function ModelsPage() {
  const { isAdmin } = useAuth();
  const { data: models, isLoading } = useModels(true);
  const [editing, setEditing] = useState<ModelRegistryEntry | null>(null);
  const queryClient = useQueryClient();

  const families = useMemo(() => {
    const grouped = new Map<string, ModelRegistryEntry[]>();
    for (const model of models ?? []) grouped.set(model.family, [...(grouped.get(model.family) ?? []), model]);
    return [...grouped.entries()];
  }, [models]);

  async function toggleActive(model: ModelRegistryEntry, isActive: boolean) {
    const { error } = await supabase.from("model_registry").update({ is_active: isActive }).eq("id", model.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`${model.display_name} ${isActive ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries({ queryKey: ["models"] });
    }
  }

  return (
    <AppShell title="Models">
      <div className="space-y-8 p-6">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every control on the Create page is generated from these registry entries. Adding a model is a registry
          change, not a code change. Provider credentials are stored as backend secrets and never editable here.
        </p>

        {isLoading && <Skeleton className="h-40 rounded-lg" />}

        {!isLoading && !families.length && (
          <EmptyState icon={Boxes} title="No models configured" description="The model registry is empty." />
        )}

        {families.map(([family, entries]) => (
          <section key={family} className="space-y-3">
            <h2 className="label-eyebrow">{family}</h2>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="divide-y divide-border">
                {entries.map((model) => (
                  <div key={model.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{model.display_name}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {model.provider}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {model.output_type}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {OPERATION_LABELS[model.operation] ?? model.operation}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {model.recommended_for ?? model.description} · {model.model_path}
                      </p>
                    </div>
                    {isAdmin ? (
                      <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" onClick={() => setEditing(model)}>
                          Edit
                        </Button>
                        <Switch
                          checked={model.is_active}
                          onCheckedChange={(checked) => void toggleActive(model, checked)}
                          aria-label={`Toggle ${model.display_name}`}
                        />
                      </div>
                    ) : (
                      <Badge variant={model.is_active ? "default" : "outline"}>
                        {model.is_active ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
      </div>

      <EditModelDialog model={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </AppShell>
  );
}

function EditModelDialog({
  model,
  onOpenChange,
}: {
  model: ModelRegistryEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");
  const [recommended, setRecommended] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [defaults, setDefaults] = useState("{}");
  const [busy, setBusy] = useState(false);

  const key = model?.id ?? "none";

  return (
    <Dialog
      open={!!model}
      onOpenChange={(open) => {
        if (open && model) {
          setDisplayName(model.display_name);
          setRecommended(model.recommended_for ?? "");
          setSortOrder(model.sort_order);
          setDefaults(JSON.stringify(model.default_parameters ?? {}, null, 2));
        }
        onOpenChange(open);
      }}
    >
      <DialogContent key={key}>
        <DialogHeader>
          <DialogTitle>Edit model metadata</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recommended">Best for</Label>
            <Input id="recommended" value={recommended} onChange={(event) => setRecommended(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort-order">Sort order</Label>
            <Input
              id="sort-order"
              type="number"
              value={sortOrder}
              onChange={(event) => setSortOrder(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaults">Default parameters (JSON)</Label>
            <Textarea id="defaults" rows={6} value={defaults} onChange={(event) => setDefaults(event.target.value)} className="font-mono text-xs" />
          </div>
          <Button
            disabled={busy}
            onClick={async () => {
              if (!model) return;
              setBusy(true);
              try {
                const parsed = JSON.parse(defaults) as never;
                const { error } = await supabase
                  .from("model_registry")
                  .update({
                    display_name: displayName,
                    recommended_for: recommended,
                    sort_order: sortOrder,
                    default_parameters: parsed,
                  })
                  .eq("id", model.id);
                if (error) throw new Error(error.message);
                queryClient.invalidateQueries({ queryKey: ["models"] });
                toast.success("Model updated");
                onOpenChange(false);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not save the model");
              } finally {
                setBusy(false);
              }
            }}
          >
            Save changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
