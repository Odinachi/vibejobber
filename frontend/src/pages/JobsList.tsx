import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import { rankJobs } from "@/lib/mockAI";
import { PageHeader } from "@/components/PageHeader";
import { MatchRing } from "@/components/MatchRing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Bookmark, BookmarkCheck, Eye, EyeOff, Link2, Loader2, MapPin, Search } from "lucide-react";
import type { WorkMode } from "@/lib/types";
import { store } from "@/lib/store";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import {
  getImportJobFromUrlFunctionUrl,
  requestImportJobFromUrl,
  setPendingImportedJobId,
} from "@/lib/jobImport";

const WORK_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];

export default function JobsList() {
  const navigate = useNavigate();
  const profile = useStore((s) => s.profile);
  const prefs = useStore((s) => s.preferences);
  const jobs = useStore((s) => s.jobs);
  const apps = useStore((s) => s.applications);
  const dismissed = useStore((s) => s.dismissedJobIds);

  const [query, setQuery] = useState("");
  const [modes, setModes] = useState<WorkMode[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [jobUrlInput, setJobUrlInput] = useState("");
  const [jobUrlImporting, setJobUrlImporting] = useState(false);

  const filtered = useMemo(() => {
    let list = jobs;
    if (!showDismissed) list = list.filter((j) => !dismissed.includes(j.id));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.company.toLowerCase().includes(q) ||
          j.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    if (modes.length > 0) list = list.filter((j) => modes.includes(j.workMode));
    const ranked = rankJobs(profile, prefs, list);
    return ranked.map((m) => ({ match: m, job: jobs.find((j) => j.id === m.jobId)! }));
  }, [jobs, dismissed, query, modes, showDismissed, profile, prefs]);

  const savedJobIds = new Set(apps.map((a) => a.jobId));

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Jobs"
        description="Every job is scored against your profile. Save the ones worth pursuing."
      />

      <div className="p-6 space-y-4">
        <Card className="border-primary/15 bg-card/60">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0">
                <Link2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-sm">Add a job from a link</p>
                <p className="text-xs text-muted-foreground">
                  Paste the full URL of a single job posting (employer or ATS page). We fetch it on the server and only
                  accept pages that look like real listings—generic sites, social feeds, and homepages are rejected—then
                  we add it to the catalog or open it if it is already there.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <Input
                type="url"
                inputMode="url"
                placeholder="https://company.com/careers/…"
                value={jobUrlInput}
                onChange={(e) => setJobUrlInput(e.target.value)}
                disabled={jobUrlImporting}
                className="sm:flex-1"
              />
              <Button
                type="button"
                disabled={jobUrlImporting || !jobUrlInput.trim()}
                onClick={async () => {
                  const raw = jobUrlInput.trim();
                  if (!raw) {
                    toast.error("Paste a job URL first.");
                    return;
                  }
                  if (!getImportJobFromUrlFunctionUrl()) {
                    toast.error("Set VITE_FIREBASE_PROJECT_ID so the import function URL can be resolved.");
                    return;
                  }
                  setJobUrlImporting(true);
                  try {
                    const r = await requestImportJobFromUrl(raw);
                    if (!r.ok || !r.jobId) {
                      toast.error(r.error || "Could not add that job.");
                      return;
                    }
                    setJobUrlInput("");
                    setPendingImportedJobId(r.jobId);
                    toast.success(
                      r.existing ? "That job is already in the catalog — opening it." : "Job verified and added — opening it.",
                    );
                    navigate(`/app/jobs/${r.jobId}`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Import failed.");
                  } finally {
                    setJobUrlImporting(false);
                  }
                }}
                className="sm:shrink-0"
              >
                {jobUrlImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying…
                  </>
                ) : (
                  "Verify & add"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by title, company, tag…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            {WORK_MODES.map((m) => {
              const active = modes.includes(m);
              return (
                <Button
                  key={m}
                  size="sm"
                  variant={active ? "default" : "outline"}
                  onClick={() => setModes((p) => (active ? p.filter((x) => x !== m) : [...p, m]))}
                  className={active ? "bg-primary" : ""}
                >
                  {m}
                </Button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowDismissed((v) => !v)}
              title={showDismissed ? "Hide dismissed" : "Show dismissed"}
            >
              {showDismissed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="ml-1 text-xs">{showDismissed ? "Hide" : "Show"} dismissed</span>
            </Button>
          </div>
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No jobs match those filters.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {filtered.map(({ job, match }) => {
              const isDismissed = dismissed.includes(job.id);
              const isSaved = savedJobIds.has(job.id);
              return (
                <li key={job.id}>
                  <Card className={`transition-all hover:shadow-floating ${isDismissed ? "opacity-50" : ""}`}>
                    <CardContent className="p-5 flex flex-col md:flex-row md:items-center gap-4">
                      <MatchRing score={match.score} size={64} />
                      <div className="min-w-0 flex-1">
                        <Link to={`/app/jobs/${job.id}`} className="block group">
                          <h3 className="font-display font-bold text-base group-hover:text-primary transition-colors truncate">
                            {job.title}
                          </h3>
                        </Link>
                        <p className="text-sm text-muted-foreground truncate">
                          {job.company} · <MapPin className="inline h-3 w-3 -mt-0.5" /> {job.location}
                        </p>
                        <p className="mt-2 text-sm text-foreground/80 line-clamp-2">{match.reasoning}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="capitalize">
                            {job.workMode}
                          </Badge>
                          <Badge variant="secondary" className="capitalize">
                            {job.jobType}
                          </Badge>
                          {job.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                          <span className="text-xs text-muted-foreground self-center ml-1">
                            · {formatDistanceToNow(new Date(job.postedAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant={isSaved ? "secondary" : "default"}
                          className={isSaved ? "" : "bg-gradient-primary text-primary-foreground hover:opacity-95"}
                          onClick={() => {
                            if (!isSaved) {
                              void store.saveJob(job.id).then(() => toast.success(`Saved ${job.title}`));
                            }
                          }}
                          disabled={isSaved}
                        >
                          {isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                          {isSaved ? "Saved" : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (isDismissed) void store.undismissJob(job.id);
                            else {
                              void store.dismissJob(job.id);
                              toast(`Dismissed ${job.title}`);
                            }
                          }}
                        >
                          {isDismissed ? "Undo" : "Dismiss"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
