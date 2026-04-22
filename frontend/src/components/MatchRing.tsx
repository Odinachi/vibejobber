import { cn } from "@/lib/utils";

interface MatchRingProps {
  score: number;
  size?: number;
  className?: string;
}

export function MatchRing({ score, size = 56, className }: MatchRingProps) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const colorClass =
    score >= 80
      ? "stroke-success"
      : score >= 65
      ? "stroke-primary"
      : score >= 50
      ? "stroke-warning"
      : "stroke-muted-foreground";
  const labelColor =
    score >= 80
      ? "text-success"
      : score >= 65
      ? "text-primary"
      : score >= 50
      ? "text-warning"
      : "text-muted-foreground";

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={4}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("transition-[stroke-dashoffset] duration-700", colorClass)}
        />
      </svg>
      <span className={cn("absolute font-display text-sm font-bold", labelColor)}>{score}</span>
    </div>
  );
}
