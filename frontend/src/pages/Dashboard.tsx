import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/lib/store";
import { rankJobs, computeInsights } from "@/lib/mockAI";
import { PageHeader } from "@/components/PageHeader";
import { MatchRing } from "@/components/MatchRing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Briefcase, Sparkles, ArrowRight, TrendingUp, ClipboardList, Bookmark } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationStatus } from "@/lib/types";

export default function Dashboard() {
  const profile = useStore((s) => s.profile);
  const prefs = useStore((s) => s.preferences);
  const jobs = useStore((s) => s.jobs);
  const apps = useStore((s) => s.applications);
  const dismissed = useStore((s) => s.dismissedJobIds);

  const recommended = useMemo(() => {
    const visible = jobs.filter((j) => !dismissed.includes(j.id));
    return rankJobs(profile, prefs, visible).slice(0, 5);
  }, [profile, prefs, jobs, dismissed]);

  const insights = useMemo(() => computeInsights(apps), [apps]);

  const funnelCounts: Record<ApplicationStatus, number> = {
    saved: apps.filter((a) => a.status === "saved").length,
    applied: apps.filter((a) => a.status === "applied").length,
    interview: apps.filter((a) => a.status === "interview").length,
    offer: apps.filter((a) => a.status === "offer").length,
    rejected: apps.filter((a) => a.status === "rejected").length,
  };

  const maxWeek = Math.max(1, ...insights.weeklyActivity.map((w) => w.count));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={`Welcome back, ${profile.fullName.split(" ")[0]}`}
        description="Here's what your job search looks like today."
        actions={
          <Button asChild className="bg-gradient-primary text-primary-foreground shadow-glow hover:opacity-95">
            <Link to="/app/jobs">
              <Sparkles className="h-4 w-4" /> Find new jobs
            </Link>
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Bookmark} label="Saved" value={funnelCounts.saved} accent="text-status-saved" />
          <StatCard icon={ClipboardList} label="Applied" value={funnelCounts.applied + funnelCounts.interview + funnelCounts.offer} accent="text-status-applied" />
          <StatCard icon={Briefcase} label="In interview" value={funnelCounts.interview + funnelCounts.offer} accent="text-status-interview" />
          <StatCard icon={TrendingUp} label="Response rate" value={`${insights.responseRate}%`} accent="text-success" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Recommended */}
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-display text-lg font-bold">Top matches for you</h2>
                  <p className="text-xs text-muted-foreground">Ranked by AI based on your profile + preferences</p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/app/jobs">
                    View all <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              {recommended.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  No recommendations yet — head to <Link to="/app/jobs" className="text-primary underline">Jobs</Link>.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recommended.map((m) => {
                    const job = jobs.find((j) => j.id === m.jobId)!;
                    return (
                      <li key={m.jobId}>
                        <Link
                          to={`/app/jobs/${m.jobId}`}
                          className="flex items-center gap-4 rounded-lg border p-3 hover:bg-accent/40 transition-colors"
                        >
                          <MatchRing score={m.score} size={48} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{job.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {job.company} · {job.location}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Funnel */}
          <Card>
            <CardContent className="p-6">
              <h2 className="font-display text-lg font-bold mb-4">Application funnel</h2>
              <div className="space-y-3">
                {(Object.keys(funnelCounts) as ApplicationStatus[]).map((s) => (
                  <div key={s} className="flex items-center gap-3">
                    <div className="w-24 shrink-0">
                      <StatusBadge status={s} />
                    </div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, funnelCounts[s] * 18)}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold w-6 text-right">{funnelCounts[s]}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity */}
        <Card>
          <CardContent className="p-6">
            <h2 className="font-display text-lg font-bold mb-4">Last 8 weeks</h2>
            <div className="flex items-end gap-2 h-32">
              {insights.weeklyActivity.map((w) => (
                <div key={w.week} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <div className="w-full flex-1 flex items-end">
                    <div
                      className="w-full rounded-t-md bg-gradient-primary transition-all"
                      style={{ height: `${(w.count / maxWeek) * 100}%`, minHeight: w.count ? "8%" : "2%", opacity: w.count ? 1 : 0.25 }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground truncate">{w.week}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-display font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
