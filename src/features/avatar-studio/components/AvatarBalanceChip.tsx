import { Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAvatarStatus } from "../hooks/useAvatarData";

/**
 * The HeyGen balance on the top bar while in Avatar Studio, which bills from
 * it (Creative Studio's chip shows the Higgsfield balance instead). HeyGen
 * reports it live; this reads Avatar Studio's own provider status.
 */
export function AvatarBalanceChip() {
  const { data } = useAvatarStatus();
  const heygen = data?.heygen;
  if (!heygen?.configured) return null;
  const connected = heygen.state === "connected";
  const label =
    heygen.account?.balanceLabel ?? (connected ? "HeyGen connected" : "HeyGen unavailable");
  const detail = heygen.account?.plan ?? heygen.account?.billing ?? null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/avatar/settings"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs tabular-nums transition-colors hover:bg-surface-raised",
            connected ? "border-border text-foreground" : "border-warning/60 text-warning",
          )}
          aria-label={`HeyGen balance: ${label}`}
          data-testid="avatar-balance-chip"
        >
          <Wallet className="size-3" />
          <span>{label}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {connected
          ? `HeyGen balance, which Avatar Studio bills from${detail ? ` (${detail})` : ""}`
          : (heygen.message ?? "HeyGen didn't answer")}
      </TooltipContent>
    </Tooltip>
  );
}
