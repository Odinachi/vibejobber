import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ArrowUpRight } from "lucide-react";

const workflow = [
  {
    n: "01",
    title: "Catalog",
    body: "Jobs load from your Firestore collection. You browse, filter, and dismiss what does not fit.",
  },
  {
    n: "02",
    title: "Fit score",
    body: "Each role gets a transparent score with reasoning tied to your profile and stated preferences.",
  },
  {
    n: "03",
    title: "Draft & track",
    body: "CV and cover drafts you can edit. Applications sit in a board from saved through to offer.",
  },
] as const;

const commitments = [
  "No auto-submit: outbound links stay on the employer’s site.",
  "Profile, pipeline, and documents stay under your Firebase project.",
  "Scores show why — not just a number in a circle.",
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="container flex h-14 max-w-6xl items-center justify-between md:h-16">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="rounded-md font-medium">
              <Link to="/login" className="inline-flex items-center gap-1.5">
                Continue
                <ArrowUpRight className="h-3.5 w-3.5 opacity-80" aria-hidden />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative border-b border-border/80">
          <div className="pointer-events-none absolute inset-0 landing-hero-grid opacity-[0.4] dark:opacity-[0.25]" aria-hidden />
          <div className="container relative max-w-6xl py-16 md:py-24 lg:py-28">
            <div className="grid items-end gap-14 lg:grid-cols-12 lg:gap-10">
              <div className="space-y-8 lg:col-span-7">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground sm:text-xs">
                  Job search workspace
                </p>
                <h1 className="font-display text-[2.125rem] font-semibold leading-[1.06] tracking-[-0.035em] text-balance sm:text-5xl md:text-[3.25rem] lg:text-[3.5rem]">
                  Fewer tabs. Clearer decisions. Applications you still recognize as yours.
                </h1>
                <p className="max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Use Vibejobber to rank roles, generate drafts you edit before sending, and keep one pipeline
                  instead of five spreadsheets. It does not apply on your behalf.
                </p>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                  <Button asChild size="lg" className="h-11 rounded-md px-7 font-medium shadow-none">
                    <Link to="/login">Open Vibejobber</Link>
                  </Button>
                  {/* <Link
                    to="/firebase-setup"
                    className="text-sm text-muted-foreground underline decoration-border underline-offset-[6px] transition-colors hover:text-foreground"
                  >
                    Connect Firebase first
                  </Link> */}
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="border border-border bg-card shadow-[0_0_0_1px_hsl(var(--border)/0.6),0_20px_50px_-24px_hsl(245_30%_12%/0.18)] dark:shadow-[0_0_0_1px_hsl(var(--border)/0.5),0_24px_60px_-20px_hsl(0_0%_0%/0.45)]">
                  <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Match detail
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">v0</span>
                  </div>
                  <div className="space-y-0 divide-y divide-border font-mono text-[11px] leading-snug sm:text-xs">
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-sans text-sm font-medium tracking-tight text-foreground">Platform engineer</p>
                          <p className="mt-0.5 text-muted-foreground">Series B · EU remote</p>
                        </div>
                        <span className="shrink-0 tabular-nums text-foreground">74</span>
                      </div>
                      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground sm:text-[11px]">
                        Strong overlap on distributed systems and API design; lighter on mobile. Worth a read of the
                        job description before tailoring.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3">
                      {["CV draft", "Cover draft", "Saved"].map((label) => (
                        <div key={label} className="bg-muted/25 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {label}
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-3 text-muted-foreground">
                      <span className="text-foreground/80">—</span> Opens employer apply URL in a new tab when you
                      are ready.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/80 bg-muted/15">
          <div className="container max-w-6xl py-14 md:py-20">
            <div className="mb-10 max-w-lg md:mb-14">
              <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">How it fits together</h2>
              <p className="mt-3 font-sans text-sm leading-relaxed text-muted-foreground md:text-base">
                Three passes through the product — no feature matrix, no mascot.
              </p>
            </div>
            <ol className="grid gap-10 sm:grid-cols-3 sm:gap-8 md:gap-12">
              {workflow.map((item) => (
                <li key={item.n} className="space-y-3 border-t border-border pt-8 first:border-t-0 first:pt-0 sm:border-t-0 sm:pt-0">
                  <span className="block font-mono text-[11px] tabular-nums text-muted-foreground">{item.n}</span>
                  <h3 className="font-display text-lg font-semibold tracking-tight">{item.title}</h3>
                  <p className="font-sans text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bg-foreground py-16 text-background md:py-24">
          <div className="container max-w-6xl">
            <div className="grid gap-12 md:grid-cols-2 md:items-start md:gap-16">
              <div>
                <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight md:text-3xl">
                  Built for people who still want to read what goes out.
                </h2>
                <p className="mt-5 max-w-md font-sans text-sm leading-relaxed opacity-90 md:text-base">
                  Automation that hides the final step trains you out of the loop. Vibejobber keeps you in it — with
                  structure, not spam.
                </p>
              </div>
              <ul className="space-y-5 font-sans text-sm leading-relaxed md:text-[15px]">
                {commitments.map((line) => (
                  <li key={line} className="flex gap-4 border-l-2 border-background/25 pl-5">
                    <span className="select-none font-mono text-xs tabular-nums opacity-50">—</span>
                    <span className="opacity-95">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-border/60 py-16 md:py-20">
          <div className="container flex max-w-6xl flex-col items-start justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-xl font-semibold tracking-tight md:text-2xl">Ready when you are.</p>
              <p className="mt-2 max-w-md font-sans text-sm text-muted-foreground">
                Sign in with Google or Apple after Firebase is configured.
              </p>
            </div>
            <Button asChild size="lg" className="h-11 shrink-0 rounded-md px-8 font-medium shadow-none">
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="container flex max-w-6xl flex-col gap-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="font-mono tabular-nums">
            © {new Date().getFullYear()} · Vibejobber
          </p>
        </div>
      </footer>
    </div>
  );
}
