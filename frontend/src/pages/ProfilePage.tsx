import { useState } from "react";
import { useStore, store } from "@/lib/store";
import { mockParseCV } from "@/lib/mockAI";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileUp, Plus, Trash2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

export default function ProfilePage() {
  const profile = useStore((s) => s.profile);
  const [skill, setSkill] = useState("");
  const [parsing, setParsing] = useState(false);

  const onUploadCV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    await new Promise((r) => setTimeout(r, 900));
    const text = await file.text().catch(() => "");
    const patch = mockParseCV(text);
    store.updateProfile(patch);
    setParsing(false);
    toast.success(`Parsed ${file.name} — profile updated`);
    e.target.value = "";
  };

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader
        title="Profile"
        description="Used by AI to score jobs and tailor your CVs and cover letters."
        actions={
          <label className="inline-flex">
            <input type="file" accept=".pdf,.txt,.doc,.docx" hidden onChange={onUploadCV} />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="cursor-pointer"
              disabled={parsing}
            >
              <span>
                {parsing ? <Sparkles className="h-4 w-4 animate-pulse" /> : <FileUp className="h-4 w-4" />}
                {parsing ? "Parsing CV…" : "Import CV (auto-fill)"}
              </span>
            </Button>
          </label>
        }
      />

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Personal info */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-display font-bold">Personal info</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" value={profile.fullName} onChange={(v) => store.updateProfile({ fullName: v })} />
              <Field label="Email" value={profile.email} onChange={(v) => store.updateProfile({ email: v })} />
              <Field label="Phone" value={profile.phone} onChange={(v) => store.updateProfile({ phone: v })} />
              <Field label="Location" value={profile.location} onChange={(v) => store.updateProfile({ location: v })} />
              <div className="sm:col-span-2">
                <Field label="Headline" value={profile.headline} onChange={(v) => store.updateProfile({ headline: v })} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Summary</Label>
                <Textarea
                  value={profile.summary}
                  onChange={(e) => store.updateProfile({ summary: e.target.value })}
                  rows={4}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Skills */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="font-display font-bold">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <Badge key={s} variant="secondary" className="gap-1.5 pr-1">
                  {s}
                  <button
                    onClick={() => store.removeSkill(s)}
                    className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (skill.trim()) {
                  store.addSkill(skill.trim());
                  setSkill("");
                }
              }}
            >
              <Input
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
                placeholder="Add a skill (e.g. GraphQL)"
                className="max-w-xs"
              />
              <Button type="submit" variant="outline" size="default">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Work history */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold">Work history</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  store.addWork({
                    company: "New company",
                    role: "Your role",
                    startDate: new Date().toISOString().slice(0, 7),
                    endDate: null,
                    achievements: [],
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add role
              </Button>
            </div>
            {profile.workHistory.length === 0 && (
              <p className="text-sm text-muted-foreground">No experience yet — add your first role.</p>
            )}
            <div className="space-y-4">
              {profile.workHistory.map((w) => (
                <div key={w.id} className="rounded-lg border p-4 space-y-3 bg-card">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Field label="Company" value={w.company} onChange={(v) => store.updateWork(w.id, { company: v })} />
                    <Field label="Role" value={w.role} onChange={(v) => store.updateWork(w.id, { role: v })} />
                    <Field label="Start (YYYY-MM)" value={w.startDate} onChange={(v) => store.updateWork(w.id, { startDate: v })} />
                    <Field
                      label="End (YYYY-MM, blank = present)"
                      value={w.endDate ?? ""}
                      onChange={(v) => store.updateWork(w.id, { endDate: v || null })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Achievements (one per line)</Label>
                    <Textarea
                      value={w.achievements.join("\n")}
                      onChange={(e) =>
                        store.updateWork(w.id, { achievements: e.target.value.split("\n").filter(Boolean) })
                      }
                      rows={3}
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => store.removeWork(w.id)}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Education */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold">Education</h2>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  store.addEducation({
                    school: "New school",
                    degree: "Degree",
                    field: "Field",
                    startDate: "2020-09",
                    endDate: "2024-06",
                  })
                }
              >
                <Plus className="h-4 w-4" /> Add education
              </Button>
            </div>
            <div className="space-y-3">
              {profile.education.map((e) => (
                <div key={e.id} className="rounded-lg border p-4 grid sm:grid-cols-2 gap-3">
                  <Field label="School" value={e.school} onChange={(v) => store.updateProfile({ education: profile.education.map((x) => (x.id === e.id ? { ...x, school: v } : x)) })} />
                  <Field label="Degree" value={e.degree} onChange={(v) => store.updateProfile({ education: profile.education.map((x) => (x.id === e.id ? { ...x, degree: v } : x)) })} />
                  <Field label="Field" value={e.field} onChange={(v) => store.updateProfile({ education: profile.education.map((x) => (x.id === e.id ? { ...x, field: v } : x)) })} />
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Field label="Years" value={`${e.startDate} – ${e.endDate ?? "Present"}`} onChange={() => {}} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => store.removeEducation(e.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
