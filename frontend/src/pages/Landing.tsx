import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import {
  Sparkles,
  Target,
  FileText,
  ClipboardList,
  ShieldCheck,
  ArrowRight,
  Check,
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Nav */}
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">
            <Link to="/login">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="container pt-12 pb-24 md:pt-20 md:pb-32 text-center max-w-4xl">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm animate-fade-in">
          <Sparkles className="h-3 w-3 text-primary" />
          Smart, transparent, you stay in control
        </span>
        <h1 className="mt-6 text-4xl md:text-6xl font-display font-extrabold tracking-tight leading-[1.05] animate-fade-in">
          Your AI co-pilot for the{" "}
          <span className="bg-gradient-primary bg-clip-text text-transparent">job hunt</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto animate-fade-in">
          Vibejobber finds the right roles, scores how well they fit your profile, and helps you ship
          tailored CVs and cover letters — all without ever auto-applying behind your back.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 animate-fade-in">
          <Button asChild size="lg" className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">
            <Link to="/login">
              Open Vibejobber <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/login">I already have an account</Link>
          </Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Profile, applications, and documents sync to your Firebase project (Firestore + Authentication).
        </p>
      </section>

      {/* Feature grid */}
      <section className="container pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Target, title: "Smart matching", body: "Every job is scored against your profile and preferences with clear reasoning." },
            { icon: FileText, title: "Tailored documents", body: "Generate role-specific CVs and cover letters in seconds. Edit, then download as PDF." },
            { icon: ClipboardList, title: "Application tracker", body: "Saved → Applied → Interview → Offer. Timeline of every step." },
            { icon: ShieldCheck, title: "You stay in control", body: "Vibejobber never submits an application for you. Apply links open the official job page." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border bg-card p-6 shadow-elegant hover:shadow-floating transition-shadow">
              <div className="h-10 w-10 rounded-lg bg-primary-soft text-primary flex items-center justify-center">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display font-bold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Principle */}
      <section className="container pb-24">
        <div className="rounded-3xl bg-card border shadow-elegant p-8 md:p-12 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold tracking-tight">
              Not an auto-apply bot.<br />
              <span className="text-primary">A smart assistant.</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              We believe the best applications are crafted, not blasted. Vibejobber does the heavy lifting —
              ranking, drafting, organizing — and leaves the final word to you.
            </p>
          </div>
          <ul className="space-y-3 text-sm">
            {[
              "Reasoning shown for every match score",
              "Documents preview-first, edit-anywhere",
              "Apply links open the official job page",
              "Your data lives in your own Firebase project",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-3 w-3" />
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t bg-card/50 py-8">
        <div className="container flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <Logo />
          <span>© {new Date().getFullYear()} Vibejobber — Demo build</span>
        </div>
      </footer>
    </div>
  );
}
