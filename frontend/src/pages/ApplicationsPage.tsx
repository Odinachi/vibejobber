import { useEffect, useMemo, useState } from "react";
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
import { GripVertical, LayoutGrid, List, Trash2, ExternalLink } from "lucide-react";
import type { ApplicationStatus } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

const STATUSES: ApplicationStatus[] = ["saved", "applied", "interview", "offer", "rejected"];

function formatAgentStatus(status: string): string {
  const m: Record<string, string> = {
    queued: "Agent: queued",
    fetching_page: "Agent: reading posting",
    using_app_documents: "Agent: your CV & cover → PDFs",
    generating_cover: "Agent: cover",
    generating_cv: "Agent: CV",
    planning_form: "Agent: form plan",
    uploading: "Agent: uploading",
    completed: "Agent: done",
    failed: "Agent: failed",
  };
  return m[status] ?? `Agent: ${status}`;
}

export default function ApplicationsPage() {
  const apps = useStore((s) => s.applications);
  const jobs = useStore((s) => s.jobs);
  const applicationRuns = useStore((s) => s.applicationRuns);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [kanbanDropOver, setKanbanDropOver] = useState<ApplicationStatus | null>(null);

  useEffect(() => {
    const clear = () => setKanbanDropOver(null);
    document.addEventListener("dragend", clear);
    return () => document.removeEventListener("dragend", clear);
  }, []);

  const enriched = useMemo(
    () => apps.map((a) => ({ app: a, job: jobs.find((j) => j.id === a.jobId)! })).filter((x) => x.job),
    [apps, jobs],
  );

  const latestRunByJob = useMemo(() => {
    const map = new Map<string, (typeof applicationRuns)[0]>();
    for (const r of applicationRuns) {
      const cur = map.get(r.jobId);
      if (!cur || r.updatedAt > cur.updatedAt) map.set(r.jobId, r);
    }
    return map;
  }, [applicationRuns]);

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
                <div
                  key={s}
                  className={`rounded-xl p-3 min-h-[200px] border border-transparent transition-colors ${
                    kanbanDropOver === s ? "ring-2 ring-primary/30 bg-primary/[0.06] border-border/50" : "bg-muted/40"
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setKanbanDropOver(s);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setKanbanDropOver((c) => (c === s ? null : c));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setKanbanDropOver(null);
                    const appId = e.dataTransfer.getData("text/x-vibejobber-app");
                    if (!appId) return;
                    const cur = store.getState().applications.find((a) => a.id === appId);
                    if (cur && cur.status !== s) {
                      void store.setApplicationStatus(appId, s, "Moved on board");
                    }
                  }}
                  role="region"
                  aria-label={`${STATUS_LABELS[s]} column — drop applications here`}
                >
                  <div className="flex items-center justify-between mb-3 px-1">
                    <StatusBadge status={s} />
                    <span className="text-xs text-muted-foreground">{items.length}</span>
                  </div>
                  <ul className="space-y-2 min-h-[4rem]">
                    {items.map(({ app, job }) => (
                      <li
                        key={app.id}
                        className="flex gap-0.5 rounded-lg border bg-card p-1.5 shadow-sm hover:shadow-elegant transition-shadow"
                      >
                        <span
                          className="inline-flex shrink-0 touch-none cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground rounded-sm"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/x-vibejobber-app", app.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          title="Drag to another column to change status"
                          aria-label={`Drag to change status: ${job.title}`}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                        <Link
                          to={`/app/jobs/${job.id}`}
                          className="min-w-0 flex-1 block py-1.5 pl-0 pr-2"
                          draggable={false}
                        >
                          <p className="font-semibold text-sm truncate leading-tight">{job.title}</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{job.company}</p>
                          {latestRunByJob.get(app.jobId) && (
                            <p className="text-[10px] text-primary mt-1.5 line-clamp-1">
                              {formatAgentStatus(latestRunByJob.get(app.jobId)!.status)}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground mt-2">
                            {formatDistanceToNow(new Date(app.appliedAt ?? app.savedAt), { addSuffix: true })}
                          </p>
                        </Link>
                      </li>
                    ))}
                    {items.length === 0 && (
                      <li className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border/50 rounded-lg">
                        Drop here
                      </li>
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
                          onValueChange={(v) => void store.setApplicationStatus(app.id, v as ApplicationStatus)}
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
                        {latestRunByJob.get(app.jobId) && (
                          <span className="text-primary block mb-0.5">
                            {formatAgentStatus(latestRunByJob.get(app.jobId)!.status)}
                          </span>
                        )}
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
                        <Button variant="ghost" size="sm" onClick={() => void store.removeApplication(app.id)}>
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
