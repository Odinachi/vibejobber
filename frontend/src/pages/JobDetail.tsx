import { useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useStore, store } from "@/lib/store";
import { scoreJob, generateTailoredCV, generateCoverLetter } from "@/lib/mockAI";
import { PageHeader } from "@/components/PageHeader";
import { MatchRing } from "@/components/MatchRing";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/StatusBadge";
import { ArrowLeft, Bookmark, BookmarkCheck, ExternalLink, FileText, MailPlus, Sparkles, ShieldCheck } from "lucide-react";
import { DocumentEditorDialog } from "@/components/DocumentEditorDialog";
import type { GeneratedDocument } from "@/lib/types";
import { toast } from "sonner";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const profile = useStore((s) => s.profile);
  const prefs = useStore((s) => s.preferences);
  const job = useStore((s) => s.jobs.find((j) => j.id === id));
  const apps = useStore((s) => s.applications);
  const docs = useStore((s) => s.documents);

  const application = apps.find((a) => a.jobId === id);
  const match = useMemo(() => (job ? scoreJob(profile, prefs, job) : null), [job, profile, prefs]);

  const [editing, setEditing] = useState<GeneratedDocument | null>(null);
  const [generating, setGenerating] = useState<"cv" | "cover" | null>(null);

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

  const onGenerate = async (kind: "cv" | "cover") => {
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
                <h3 className="font-display font-bold mb-2">What you'll do</h3>
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
                <span className="text-xs text-muted-foreground">Status</span>
                {application ? <StatusBadge status={application.status} /> : <span className="text-xs">Not saved</span>}
              </div>
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
                      void store.saveJob(job.id).then(() => toast.success("Saved"));
                    }}
                  >
                    <Bookmark className="h-4 w-4" /> Save job
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" disabled>
                    <BookmarkCheck className="h-4 w-4" /> Saved
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    void (async () => {
                      if (!application) await store.saveJob(job.id);
                      const app = store.getState().applications.find((a) => a.jobId === job.id);
                      if (app) store.setApplicationStatus(app.id, "applied", "Marked as applied via apply link");
                      window.open(job.applyUrl, "_blank", "noopener,noreferrer");
                      toast.success("Apply page opened. Marked as applied.");
                    })();
                  }}
                >
                  <ExternalLink className="h-4 w-4" /> Open apply page
                </Button>
                <p className="flex items-start gap-2 text-[11px] text-muted-foreground pt-1">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-success" />
                  Vibejobber never submits applications for you — the apply link goes to the official job page.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5 space-y-3">
              <h3 className="font-display font-bold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> AI documents
              </h3>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => onGenerate("cv")}
                disabled={generating === "cv"}
              >
                <FileText className="h-4 w-4" />
                {generating === "cv" ? "Generating tailored CV…" : `Generate tailored CV${cvDocs.length ? ` (v${cvDocs.length + 1})` : ""}`}
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => onGenerate("cover")}
                disabled={generating === "cover"}
              >
                <MailPlus className="h-4 w-4" />
                {generating === "cover" ? "Generating cover letter…" : `Generate cover letter${coverDocs.length ? ` (v${coverDocs.length + 1})` : ""}`}
              </Button>

              {jobDocs.length > 0 && (
                <div className="border-t pt-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">Your documents for this job</p>
                  {jobDocs.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setEditing(d)}
                      className="w-full text-left text-sm flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/40"
                    >
                      <span className="truncate">
                        {d.type === "cv" ? "CV" : "Cover"} v{d.version}
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
      />
    </div>
  );
}
