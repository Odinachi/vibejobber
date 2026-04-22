import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useStore, store } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, STATUS_LABELS } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, List, Trash2, ExternalLink } from "lucide-react";
import type { ApplicationStatus } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

const STATUSES: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "rejected"];

export default function ApplicationsPage() {
  const apps = useStore((s) => s.applications);
  const jobs = useStore((s) => s.jobs);
  const [view, setView] = useState<"kanban" | "list">("kanban");

  const enriched = useMemo(
    () => apps.map((a) => ({ app: a, job: jobs.find((j) => j.id === a.jobId)! })).filter((x) => x.job),
    [apps, jobs],
  );

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader
        title="Applications"
        description="Track every saved opportunity from first interest to offer."
        actions={
          <div className="flex rounded-md border bg-muted p-0.5">
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              className={view === "kanban" ? "bg-card text-foreground shadow-sm hover:bg-card" : ""}
              onClick={() => setView("kanban")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "list" ? "default" : "ghost"}
              size="sm"
              className={view === "list" ? "bg-card text-foreground shadow-sm hover:bg-card" : ""}
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      <div className="p-6">
        {enriched.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <h3 className="font-display font-bold mb-2">No applications yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Save your first job to start tracking.</p>
              <Button asChild className="bg-gradient-primary text-primary-foreground hover:opacity-95">
                <Link to="/app/jobs">Browse jobs</Link>
              </Button>
            </CardContent>
          </Card>
        ) : view === "kanban" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STATUSES.map((s) => {
              const items = enriched.filter((e) => e.app.status === s);
              return (
                <div key={s} className="rounded-xl bg-muted/40 p-3 min-h-[200px]">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <StatusBadge status={s} />
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <ul className="space-y-2">
                    {items.map(({ app, job }) => (
                      <li key={app.id}>
                        <Link
                          to={`/app/jobs/${job.id}`}
                          className="block rounded-lg border bg-card p-3 hover:shadow-elegant transition-shadow"
                        >
                          <p className="font-semibold text-sm truncate">{job.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{job.company}</p>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            {formatDistanceToNow(new Date(app.appliedAt ?? app.savedAt), { addSuffix: true })}
                          </p>
                        </Link>
                      </li>
                    ))}
                    {items.length === 0 && (
                      <li className="text-xs text-muted-foreground text-center py-3">Empty</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-semibold">Job</th>
                    <th className="text-left p-3 font-semibold">Company</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Last update</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {enriched.map(({ app, job }) => (
                    <tr key={app.id} className="border-t hover:bg-accent/20">
                      <td className="p-3">
                        <Link to={`/app/jobs/${job.id}`} className="font-medium hover:text-primary">
                          {job.title}
                        </Link>
                      </td>
                      <td className="p-3 text-muted-foreground">{job.company}</td>
                      <td className="p-3">
                        <Select
                          value={app.status}
                          onValueChange={(v) => store.setApplicationStatus(app.id, v as ApplicationStatus)}
                        >
                          <SelectTrigger className="h-8 w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(app.appliedAt ?? app.savedAt), { addSuffix: true })}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(job.applyUrl, "_blank", "noopener,noreferrer")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => store.removeApplication(app.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
