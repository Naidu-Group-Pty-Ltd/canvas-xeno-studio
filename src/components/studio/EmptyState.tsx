import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: "/" | "/projects" | "/assets" | "/activity" | "/models" | "/usage" | "/settings";
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, actionTo, onAction }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <span className="mb-4 inline-flex size-11 items-center justify-center rounded-full border border-border bg-surface-raised">
        <Icon className="size-5 text-muted-foreground" />
      </span>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {actionLabel && (onAction || actionTo) && (
        <div className="mt-5">
          {onAction ? (
            <Button onClick={onAction}>{actionLabel}</Button>
          ) : (
            <Button asChild>
              <Link to={actionTo!}>{actionLabel}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
