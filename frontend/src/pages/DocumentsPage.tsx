import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MailOpen } from "lucide-react";
import { DocumentEditorDialog } from "@/components/DocumentEditorDialog";
import type { GeneratedDocument } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";

export default function DocumentsPage() {
  const docs = useStore((s) => s.documents);
  const [open, setOpen] = useState<GeneratedDocument | null>(null);

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader
        title="Documents"
        description="Every CV and cover letter you've generated. Click any to edit and download."
      />

      <div className="p-6">
        {docs.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <h3 className="font-display font-bold mb-2">No documents yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Open a job and generate your first tailored CV or cover letter.
              </p>
              <Button asChild className="bg-gradient-primary text-primary-foreground hover:opacity-95">
                <Link to="/app/jobs">Go to jobs</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpen(d)}
                className="text-left rounded-xl border bg-card p-5 hover:shadow-floating transition-shadow group"
              >
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${d.type === "cv" ? "bg-primary/10 text-primary" : "bg-info/10 text-info"}`}>
                    {d.type === "cv" ? <FileText className="h-5 w-5" /> : <MailOpen className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {d.type === "cv" ? "Tailored CV" : "Cover letter"} · v{d.version}
                    </p>
                    <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                      {d.company ?? "Generic"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{d.jobTitle}</p>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      {formatDistanceToNow(new Date(d.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <DocumentEditorDialog document={open} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </div>
  );
}
