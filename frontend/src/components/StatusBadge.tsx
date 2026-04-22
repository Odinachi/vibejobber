import type { ApplicationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<ApplicationStatus, string> = {
  saved: "bg-status-saved/10 text-status-saved border-status-saved/20",
  applied: "bg-status-applied/10 text-status-applied border-status-applied/20",
  interview: "bg-status-interview/15 text-status-interview border-status-interview/30",
  offer: "bg-status-offer/10 text-status-offer border-status-offer/20",
  rejected: "bg-status-rejected/10 text-status-rejected border-status-rejected/20",
};

const labels: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export function StatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
    >
      {labels[status]}
    </span>
  );
}

export const STATUS_LABELS = labels;
