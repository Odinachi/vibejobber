import { useMemo, useState } from "react";
import { useStore, store } from "@/lib/store";
import { assessCvTextReadability, extractTextForProfileImport, parseCvFromPlainText } from "@/lib/mockAI";
import { getPdfPageCount } from "@/lib/pdfPages";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileUp, Plus, Trash2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { WorkMonthPicker } from "@/components/WorkMonthPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCountrySelectOptions } from "@/lib/countries";

const defaultNewWork = () => ({
  company: "New company",
  role: "Your role",
  startDate: new Date().toISOString().slice(0, 7),
  endDate: null as string | null,
  achievements: [] as string[],
});

export default function ProfilePage() {
  const profile = useStore((s) => s.profile);
  const [skill, setSkill] = useState("");
  const [parsing, setParsing] = useState(false);
  const countryOptions = useMemo(() => getCountrySelectOptions(), []);

  const onUploadCV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const pages = await getPdfPageCount(file);
        if (pages > 3) {
          toast.error("Please use a CV of 3 pages or fewer.");
          return;
        }
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Please use a file under 5MB.");
        return;
      }
      const text = await extractTextForProfileImport(file);
      const quality = assessCvTextReadability(text);
      if (quality.ok === false) {
        toast.error(quality.message);
        return;
      }
      const patch = parseCvFromPlainText(text);
      const mergedSkills = Array.from(new Set([...profile.skills, ...(patch.skills ?? [])]));
      await store.updateProfile({ ...patch, skills: mergedSkills });
      toast.success(`Imported from ${file.name} — review the fields below.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setParsing(false);
    }
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
              <Field label="Full name" value={profile.fullName} onChange={(v) => void store.updateProfile({ fullName: v })} />
              <Field label="Email" value={profile.email} onChange={(v) => void store.updateProfile({ email: v })} />
              <Field label="Phone" value={profile.phone} onChange={(v) => void store.updateProfile({ phone: v })} />
              <div className="space-y-1.5">
                <Label className="text-xs">Country</Label>
                <Select
                  value={profile.country || "__none__"}
                  onValueChange={(v) => void store.updateProfile({ country: v === "__none__" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose country" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[min(60vh,22rem)]">
                    <SelectItem value="__none__">Choose country…</SelectItem>
                    {countryOptions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Field label="City" value={profile.city} onChange={(v) => void store.updateProfile({ city: v })} />
              <div className="sm:col-span-2">
                <Field label="Headline" value={profile.headline} onChange={(v) => void store.updateProfile({ headline: v })} />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Summary</Label>
                <Textarea
                  value={profile.summary}
                  onChange={(e) => void store.updateProfile({ summary: e.target.value })}
                  rows={4}
                />
              </div>
              <div className="sm:col-span-2 space-y-3 pt-2 border-t">
                <div>
                  <h3 className="text-sm font-medium">Professional links (optional)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    LinkedIn, GitHub, Medium, and X — used when generating tailored CVs and cover letters.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">LinkedIn</Label>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://linkedin.com/in/…"
                      value={profile.linkedInUrl ?? ""}
                      onChange={(e) => void store.updateProfile({ linkedInUrl: e.target.value.trim() || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">GitHub</Label>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://github.com/…"
                      value={profile.githubUrl ?? ""}
                      onChange={(e) => void store.updateProfile({ githubUrl: e.target.value.trim() || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Medium</Label>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://medium.com/@…"
                      value={profile.mediumUrl ?? ""}
                      onChange={(e) => void store.updateProfile({ mediumUrl: e.target.value.trim() || null })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">X (Twitter)</Label>
                    <Input
                      type="url"
                      inputMode="url"
                      placeholder="https://x.com/…"
                      value={profile.xUrl ?? ""}
                      onChange={(e) => void store.updateProfile({ xUrl: e.target.value.trim() || null })}
                    />
                  </div>
                </div>
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
                    onClick={() => void store.removeSkill(s)}
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
                  void store.addSkill(skill.trim());
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
              <Button size="sm" variant="outline" onClick={() => void store.addWork(defaultNewWork())}>
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
                    <Field label="Company" value={w.company} onChange={(v) => void store.updateWork(w.id, { company: v })} />
                    <Field label="Role" value={w.role} onChange={(v) => void store.updateWork(w.id, { role: v })} />
                    <WorkMonthPicker
                      label="Start month"
                      value={w.startDate}
                      onChange={(ym) => {
                        if (ym) void store.updateWork(w.id, { startDate: ym });
                      }}
                    />
                    <WorkMonthPicker
                      label="End month"
                      value={w.endDate ?? null}
                      onChange={(ym) => void store.updateWork(w.id, { endDate: ym })}
                      allowPresent
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Achievements (one per line)</Label>
                    <Textarea
                      value={w.achievements.join("\n")}
                      onChange={(e) =>
                        void store.updateWork(w.id, { achievements: e.target.value.split("\n").filter(Boolean) })
                      }
                      rows={3}
                    />
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void store.removeWork(w.id)}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                </div>
              ))}
            </div>
            {profile.workHistory.length > 0 && (
              <div className="flex justify-center pt-2 border-t border-dashed">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-full h-10 w-10"
                  title="Add another position"
                  aria-label="Add another position"
                  onClick={() => void store.addWork(defaultNewWork())}
                >
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            )}
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
                  void store.addEducation({
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
                  <Field label="School" value={e.school} onChange={(v) => void store.updateProfile({ education: profile.education.map((x) => (x.id === e.id ? { ...x, school: v } : x)) })} />
                  <Field label="Degree" value={e.degree} onChange={(v) => void store.updateProfile({ education: profile.education.map((x) => (x.id === e.id ? { ...x, degree: v } : x)) })} />
                  <Field label="Field" value={e.field} onChange={(v) => void store.updateProfile({ education: profile.education.map((x) => (x.id === e.id ? { ...x, field: v } : x)) })} />
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <Field label="Years" value={`${e.startDate} – ${e.endDate ?? "Present"}`} onChange={() => {}} />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => void store.removeEducation(e.id)}>
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
