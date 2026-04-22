import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStore, store } from "@/lib/store";
import { scoreJob, generateTailoredCV, generateCoverLetter } from "@/lib/mockAI";
import { getApplyToJobFunctionUrl, requestAgentApplyJob } from "@/lib/applyAgent";
import { PageHeader } from "@/components/PageHeader";
import { MatchRing } from "@/components/MatchRing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  FileText,
  Loader2,
  MailPlus,
  Sparkles,
  Bot,
} from "lucide-react";
import { DocumentEditorDialog } from "@/components/DocumentEditorDialog";
import type { GeneratedDocument } from "@/lib/types";
import { toast } from "sonner";

function formatAgentRunStatus(status: string): string {
  const map: Record<string, string> = {
    queued: "Queued",
    fetching_page: "Reading posting",
    generating_cover: "Drafting cover",
    generating_cv: "Tailoring CV",
    planning_form: "Planning form",
    uploading: "Uploading files",
    completed: "Completed",
    failed: "Failed",
  };
  return map[status] ?? status.replace(/_/g, " ");
}

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const profile = useStore((s) => s.profile);
  const prefs = useStore((s) => s.preferences);
  const job = useStore((s) => s.jobs.find((j) => j.id === id));
  const apps = useStore((s) => s.applications);
  const docs = useStore((s) => s.documents);
  const applicationRuns = useStore((s) => s.applicationRuns);

  const application = apps.find((a) => a.jobId === id);
  const match = useMemo(() => (job ? scoreJob(profile, prefs, job) : null), [job, profile, prefs]);

  const [editing, setEditing] = useState<GeneratedDocument | null>(null);
  const [generating, setGenerating] = useState<"cv" | "cover" | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  const runForJob = useMemo(() => {
    if (!job) return undefined;
    return applicationRuns
      .filter((r) => r.jobId === job.id)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
  }, [applicationRuns, job]);

  if (!job || !match) {
    return (
      <div className="p-10 text-center">
        <p className="text-muted-foreground">Job not found.</p>
        <Button variant="link" onClick={() => navigate("/app/jobs")}>
          Back to jobs
        </Button>
      </div>
    );
  }

  const jobDocs = docs.filter((d) => d.jobId === job.id);
  const cvDocs = jobDocs.filter((d) => d.type === "cv");
  const coverDocs = jobDocs.filter((d) => d.type === "cover_letter");
  const hasCv = cvDocs.length > 0;
  const hasCover = coverDocs.length > 0;

  const app = application;
  const cvGenLocked = (app?.cvGenLocked === true) || hasCv;
  const coverGenLocked = (app?.coverGenLocked === true) || hasCover;
  const canGenCv = !cvGenLocked;
  const canGenCover = !coverGenLocked;
  const hasBothDocs = hasCv && hasCover;
  const applyFnAvailable = Boolean(getApplyToJobFunctionUrl());

  const onGenerate = async (kind: "cv" | "cover") => {
    if (!app) {
      await store.saveJob(job.id);
    }
    const currentApp = store.getState().applications.find((a) => a.jobId === job.id);
    if (kind === "cv" && ((currentApp?.cvGenLocked === true) || cvDocs.length > 0)) {
      toast.error("You can only generate a tailored CV once. Open it to edit.");
      return;
    }
    if (kind === "cover" && ((currentApp?.coverGenLocked === true) || coverDocs.length > 0)) {
      toast.error("You can only generate a cover letter once. Open it to edit.");
      return;
    }
    setGenerating(kind);
    await new Promise((r) => setTimeout(r, 700));
    try {
      const doc =
        kind === "cv"
          ? await store.addDocument({
              type: "cv",
              jobId: job.id,
              jobTitle: job.title,
              company: job.company,
              title: `CV — ${profile.fullName} → ${job.company}`,
              content: generateTailoredCV(profile, job),
            })
          : await store.addDocument({
              type: "cover_letter",
              jobId: job.id,
              jobTitle: job.title,
              company: job.company,
              title: `Cover Letter — ${job.company}`,
              content: generateCoverLetter(profile, job),
            });
      setEditing(doc);
      toast.success(`Generated ${kind === "cv" ? "tailored CV" : "cover letter"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save document");
    } finally {
      setGenerating(null);
    }
  };

  const isSaved = !!application;

  const docAllowsDelete = (() => {
    if (!editing?.jobId) return true;
    const a = apps.find((x) => x.jobId === editing.jobId);
    if (!a) return true;
    if (editing.type === "cv" && a.cvGenLocked) return false;
    if (editing.type === "cover_letter" && a.coverGenLocked) return false;
    return true;
  })();

  const onSelfApply = () => {
    void (async () => {
      if (!application) await store.saveJob(job.id);
      const a = store.getState().applications.find((x) => x.jobId === job.id);
      if (a) store.setApplicationStatus(a.id, "applied", "Opened apply link (self-serve)");
      window.open(job.applyUrl, "_blank", "noopener,noreferrer");
      toast.success("Apply page opened. Your pipeline is marked as applied when you return.");
    })();
  };

  const onAgentApply = () => {
    if (!hasBothDocs) {
      toast.error("Generate and save a tailored CV and cover letter for this job first.");
      return;
    }
    if (!applyFnAvailable) {
      toast.error("Set VITE_FIREBASE_PROJECT_ID (and region if needed) so the apply function URL can be resolved.");
      return;
    }
    setAgentLoading(true);
    void (async () => {
      try {
        if (!application) await store.saveJob(job.id);
        const a = store.getState().applications.find((x) => x.jobId === job.id);
        const res = await requestAgentApplyJob(job.id);
        if (!res.ok) {
          toast.error(res.error || "Apply agent failed to start");
          return;
        }
        if (a && res.runId) {
          await store.updateApplication(a.id, { agentRunId: res.runId });
        }
        toast.success("Apply agent started. Watch the status below.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Request failed");
      } finally {
        setAgentLoading(false);
      }
    })();
  };

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader
        title={job.title}
        description={`${job.company} · ${job.location}`}
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app/jobs">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />

      <div className="p-6 grid lg:grid-cols-3 gap-6">
        {/* Main */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <MatchRing score={match.score} size={72} />
                <div>
                  <h2 className="font-display font-bold text-lg">{match.reasoning}</h2>
                  <p className="text-xs text-muted-foreground">AI assessment based on your profile and preferences</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="rounded-lg border p-3 bg-success/5">
                  <p className="text-xs font-semibold text-success mb-2">Strengths</p>
                  <ul className="space-y-1 text-sm">
                    {match.strengths.length === 0 && <li className="text-muted-foreground">—</li>}
                    {match.strengths.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-lg border p-3 bg-warning/5">
                  <p className="text-xs font-semibold text-warning mb-2">Gaps</p>
                  <ul className="space-y-1 text-sm">
                    {match.gaps.length === 0 && <li className="text-muted-foreground">No major gaps spotted</li>}
                    {match.gaps.map((g) => (
                      <li key={g}>• {g}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-5">
              <div>
                <h3 className="font-display font-bold mb-2">About the role</h3>
                <p className="text-sm text-foreground/80 whitespace-pre-line">{job.description}</p>
              </div>
              <div>
                <h3 className="font-display font-bold mb-2">What you&apos;ll do</h3>
                <ul className="space-y-1 text-sm">
                  {job.responsibilities.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="font-display font-bold mb-2">Requirements</h3>
                <ul className="space-y-1 text-sm">
                  {job.requirements.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
              {job.niceToHave && job.niceToHave.length > 0 && (
                <div>
                  <h3 className="font-display font-bold mb-2">Nice to have</h3>
                  <ul className="space-y-1 text-sm">
                    {job.niceToHave.map((r) => (
                      <li key={r}>• {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pipeline</span>
                {application ? <StatusBadge status={application.status} /> : <span className="text-xs">Not saved</span>}
              </div>
              {runForJob && (
                <div className="rounded-md border bg-muted/30 p-2.5 text-xs space-y-0.5">
                  <p className="font-semibold text-foreground">Apply agent</p>
                  <p className="text-muted-foreground">
                    {formatAgentRunStatus(runForJob.status)}
                    {runForJob.error && runForJob.status === "failed" ? ` — ${runForJob.error}` : ""}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary" className="capitalize">
                  {job.workMode}
                </Badge>
                <Badge variant="secondary" className="capitalize">
                  {job.jobType}
                </Badge>
                <Badge variant="outline">
                  {job.salaryCurrency} {job.salaryMin.toLocaleString()}–{job.salaryMax.toLocaleString()}
                </Badge>
              </div>
              <div className="pt-2 space-y-2">
                {!isSaved ? (
                  <Button
                    className="w-full bg-gradient-primary text-primary-foreground hover:opacity-95"
                    onClick={() => {
                      void store.saveJob(job.id).then(() => toast.success("Saved to your pipeline"));
                    }}
                  >
                    <Bookmark className="h-4 w-4" /> Save job
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    <BookmarkCheck className="h-4 w-4" /> Saved
                  </Button>
                )}
                <Button variant="outline" className="w-full" onClick={onSelfApply}>
                  <ExternalLink className="h-4 w-4" /> Open apply page (I&apos;ll apply myself)
                </Button>
                <Button
                  className="w-full bg-foreground text-background hover:bg-foreground/90"
                  onClick={onAgentApply}
                  disabled={!hasBothDocs || agentLoading || !applyFnAvailable}
                >
                  {agentLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  Let the apply agent submit for me
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  The apply agent runs on our servers, uses your tailored CV and cover from this job, and reports status
                  here. Self-apply opens the employer site in a new tab — you stay in control.
                </p>
                {!hasBothDocs && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400/90">
                    Generate both documents below to unlock the apply agent.
                  </p>
                )}
                {!applyFnAvailable && (
                  <p className="text-[11px] text-muted-foreground">
                    Add your Firebase project id in <code className="text-foreground/80">.env</code> to call the deploy
                    function.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-display font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Documents for this job
              </h3>
              <p className="text-xs text-muted-foreground">
                Each is generated once per job to match the role; afterwards you can only edit. Save the job first
                (button above) if you haven&apos;t already.
              </p>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => onGenerate("cv")}
                disabled={generating === "cv" || !canGenCv}
              >
                <FileText className="h-4 w-4" />
                {generating === "cv"
                  ? "Generating tailored CV…"
                  : hasCv
                    ? "CV generated — use Open below"
                    : "Generate CV for this job"}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => onGenerate("cover")}
                disabled={generating === "cover" || !canGenCover}
              >
                <MailPlus className="h-4 w-4" />
                {generating === "cover"
                  ? "Generating cover letter…"
                  : hasCover
                    ? "Cover letter generated — use Open below"
                    : "Generate cover letter for this job"}
              </Button>

              {jobDocs.length > 0 && (
                <div className="border-t pt-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Edit or download</p>
                  {jobDocs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setEditing(d)}
                      className="w-full text-left text-sm flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40"
                    >
                      <span className="truncate">
                        {d.type === "cv" ? "Tailored CV" : "Cover letter"} · v{d.version}
                      </span>
                      <span className="text-xs text-muted-foreground">Open</span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DocumentEditorDialog
        document={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        allowDelete={docAllowsDelete}
      />
    </div>
  );
}
