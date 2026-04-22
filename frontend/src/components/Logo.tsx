import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

interface LogoProps {
  className?: string;
  to?: string;
}

export function Logo({ className = "", to = "/" }: LogoProps) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2 group ${className}`}>
      <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
        <Sparkles className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        Vibe<span className="text-primary">jobber</span>
      </span>
    </Link>
  );
}
