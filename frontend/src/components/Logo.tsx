import { Link } from "react-router-dom";

interface LogoProps {
  className?: string;
  to?: string;
}

const brandMarkSrc = `${import.meta.env.BASE_URL}favicon.svg`;

export function Logo({ className = "", to = "/" }: LogoProps) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 group ${className}`}>
      <img
        src={brandMarkSrc}
        alt=""
        width={32}
        height={32}
        className="h-8 w-8 shrink-0 select-none"
        draggable={false}
      />
      <span className="font-display text-lg font-bold tracking-tight">
        Vibe<span className="text-primary">jobber</span>
      </span>
    </Link>
  );
}
