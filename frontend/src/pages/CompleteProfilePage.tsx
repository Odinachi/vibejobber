import { useEffect, useMemo, useRef, useState } from "react";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import { firebase } from "@/lib/firebase";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCountrySelectOptions } from "@/lib/countries";
import { useNavigate } from "react-router-dom";
import { useStore, store } from "@/lib/store";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { WorkMonthPicker } from "@/components/WorkMonthPicker";
import { extractTextForProfileImport, mockParseCV } from "@/lib/mockAI";
import { Upload, FileCheck } from "lucide-react";

const STEPS = [
  { n: 1, title: "About you", desc: "Upload your CV, then name, country, and how you describe yourself." },
  { n: 2, title: "Experience", desc: "At least one role so we can tailor CVs and matches." },
  { n: 3, title: "Skills", desc: "Add the stack and strengths you want to highlight." },
  { n: 4, title: "Job search", desc: "Roles and places you care about for ranking." },
] as const;

const newWorkEntry = () => ({
  company: "",
  role: "",
  startDate: new Date().toISOString().slice(0, 7),
  endDate: null as string | null,
  achievements: [] as string[],
});

export default function CompleteProfilePage() {
  const navigate = useNavigate();
  const synced = useStore((s) => s.firestoreSynced);
  const setup = useStore((s) => s.profileSetup);
  const profile = useStore((s) => s.profile);
  const prefs = useStore((s) => s.preferences);

  const [roleInput, setRoleInput] = useState("");
  const [locInput, setLocInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [cvUploading, setCvUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const countryOptions = useMemo(() => getCountrySelectOptions(), []);

  const step = setup.currentStep;

  useEffect(() => {
    if (synced && setup.completed) {
      navigate("/app", { replace: true });
    }
  }, [synced, setup.completed, navigate]);

  const meta = useMemo(() => STEPS.find((s) => s.n === step) ?? STEPS[0], [step]);

  if (!synced) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading your profile…</p>
      </div>
    );
  }

  const goBack = async () => {
    if (step <= 1) return;
    const nextStep = step - 1;
    await store.setProfileSetup({ completed: false, currentStep: nextStep });
  };

  const validateStep = (): string | null => {
    if (step === 1) {
      if (!profile.fullName.trim()) return "Please enter your full name.";
      if (!profile.country.trim()) return "Please choose your country.";
      if (!profile.city.trim()) return "Please enter your city.";
      if (!profile.headline.trim()) return "Please enter a headline.";
      if (profile.summary.trim().length < 40) return "Please write a short summary (at least 40 characters).";
    }
    if (step === 2) {
      if (profile.workHistory.length === 0) return "Add at least one role.";
      for (const w of profile.workHistory) {
        if (!w.company.trim() || !w.role.trim()) return "Each role needs a company and title.";
      }
    }
    if (step === 3) {
      if (profile.skills.length < 3) return "Add at least three skills.";
    }
    if (step === 4) {
      if (prefs.desiredRoles.length < 1) return "Add at least one desired role.";
      if (prefs.locations.length < 1) return "Add at least one location or “Remote” region.";
    }
    return null;
  };

  const onPickCv = () => fileInputRef.current?.click();

  const onCvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!firebase.configured || !firebase.storage || !firebase.auth?.currentUser) {
      toast.error("Firebase storage is not available.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Please use a file under 5MB.");
      return;
    }
    setCvUploading(true);
    try {
      const uid = firebase.auth.currentUser.uid;
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `users/${uid}/source-cv/${Date.now()}-${safe}`;
      const sref = ref(firebase.storage, path);
      await uploadBytes(sref, file);
      const text = await extractTextForProfileImport(file);
      const patch = mockParseCV(text);
      const mergedSkills = Array.from(
        new Set([...profile.skills, ...(patch.skills ?? [])]),
      );
      await store.updateProfile({
        ...patch,
        skills: mergedSkills,
        sourceCvStoragePath: path,
        sourceCvFileName: file.name,
        sourceCvUploadedAt: new Date().toISOString(),
      });
      toast.success("CV saved. Review and edit the fields below — you can still change everything.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCvUploading(false);
    }
  };

  const goNext = async () => {
    const err = validateStep();
    if (err) {
      toast.error(err);
      return;
    }
    if (step < 4) {
      await store.setProfileSetup({ completed: false, currentStep: step + 1 });
      return;
    }
    await store.setProfileSetup({ completed: true, currentStep: 4 });
    toast.success("You’re all set!");
    navigate("/app", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <header className="container flex h-16 items-center border-b bg-card/40 backdrop-blur">
        <Logo />
      </header>

      <div className="flex-1 container max-w-2xl py-10 px-4">
        <div className="flex gap-2 mb-8">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                s.n <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <Card className="shadow-elegant">
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Step {step} of 4 — {meta.title}
            </CardTitle>
            <CardDescription>{meta.desc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Start with your CV</p>
                      <p className="text-xs text-muted-foreground mt-1 max-w-prose">
                        We strongly recommend uploading a CV so we can pre-fill your profile. Your file is kept in
                        your account, and you can still edit every field before you finish.
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.txt,application/pdf"
                      onChange={onCvFile}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      onClick={onPickCv}
                      disabled={cvUploading}
                    >
                      {cvUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : profile.sourceCvFileName ? (
                        <FileCheck className="h-4 w-4 text-success" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {profile.sourceCvFileName ? "Replace CV" : "Upload CV"}
                    </Button>
                  </div>
                  {profile.sourceCvFileName && (
                    <p className="text-xs text-muted-foreground">
                      Saved: <span className="text-foreground font-medium">{profile.sourceCvFileName}</span>
                    </p>
                  )}
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Full name</Label>
                  <Input
                    value={profile.fullName}
                    onChange={(e) => void store.updateProfile({ fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
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
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={profile.city}
                    onChange={(e) => void store.updateProfile({ city: e.target.value })}
                    placeholder="e.g. Berlin"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Phone</Label>
                  <Input value={profile.phone} onChange={(e) => void store.updateProfile({ phone: e.target.value })} />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Professional headline</Label>
                  <Input
                    value={profile.headline}
                    onChange={(e) => void store.updateProfile({ headline: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>Summary</Label>
                  <Textarea
                    rows={5}
                    value={profile.summary}
                    onChange={(e) => void store.updateProfile({ summary: e.target.value })}
                    placeholder="A few sentences about what you do and what you want next."
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
                    Add your roles (most recent first). Use the calendar for start/end months; leave end as present if
                    you&apos;re still in the role.
                  </p>
                
                </div>
                {profile.workHistory.length === 0 ? (
                  <Button type="button" variant="outline" onClick={() => void store.addWork(newWorkEntry())}>
                    <Plus className="h-4 w-4 mr-2" /> Add a role
                  </Button>
                ) : (
                  <div className="space-y-4">
                    {profile.workHistory.map((w, idx) => (
                      <div key={w.id} className="rounded-lg border p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold text-muted-foreground">Position {idx + 1}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => void store.removeWork(w.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label>Company</Label>
                            <Input
                              value={w.company}
                              onChange={(e) => void store.updateWork(w.id, { company: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Role</Label>
                            <Input value={w.role} onChange={(e) => void store.updateWork(w.id, { role: e.target.value })} />
                          </div>
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
                            rows={4}
                            value={w.achievements.join("\n")}
                            onChange={(e) =>
                              void store.updateWork(w.id, {
                                achievements: e.target.value.split("\n").filter(Boolean),
                              })
                            }
                          />
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-center pt-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="rounded-full h-10 w-10"
                        title="Add another position"
                        aria-label="Add another position"
                        onClick={() => void store.addWork(newWorkEntry())}
                      >
                        <Plus className="h-5 w-5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((s) => (
                    <Badge key={s} variant="secondary" className="gap-1">
                      {s}
                      <button
                        type="button"
                        className="hover:opacity-70"
                        onClick={() => void store.removeSkill(s)}
                        aria-label={`Remove ${s}`}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (skillInput.trim()) {
                      void store.addSkill(skillInput.trim());
                      setSkillInput("");
                    }
                  }}
                >
                  <Input
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    placeholder="e.g. TypeScript"
                  />
                  <Button type="submit" variant="outline">
                    Add
                  </Button>
                </form>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <Label className="text-sm font-semibold">Desired roles</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {prefs.desiredRoles.map((r) => (
                      <Badge key={r} variant="secondary">
                        {r}
                        <button
                          type="button"
                          className="ml-1 hover:opacity-70"
                          onClick={() =>
                            void store.updatePreferences({
                              desiredRoles: prefs.desiredRoles.filter((x) => x !== r),
                            })
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (roleInput.trim()) {
                        void store.updatePreferences({ desiredRoles: [...prefs.desiredRoles, roleInput.trim()] });
                        setRoleInput("");
                      }
                    }}
                  >
                    <Input
                      value={roleInput}
                      onChange={(e) => setRoleInput(e.target.value)}
                      placeholder="e.g. Senior Frontend Engineer"
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Add
                    </Button>
                  </form>
                </div>
                <div>
                  <Label className="text-sm font-semibold">Locations</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {prefs.locations.map((l) => (
                      <Badge key={l} variant="secondary">
                        {l}
                        <button
                          type="button"
                          className="ml-1 hover:opacity-70"
                          onClick={() =>
                            void store.updatePreferences({ locations: prefs.locations.filter((x) => x !== l) })
                          }
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <form
                    className="mt-3 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (locInput.trim()) {
                        void store.updatePreferences({ locations: [...prefs.locations, locInput.trim()] });
                        setLocInput("");
                      }
                    }}
                  >
                    <Input
                      value={locInput}
                      onChange={(e) => setLocInput(e.target.value)}
                      placeholder="e.g. Remote (EU)"
                    />
                    <Button type="submit" variant="outline" size="sm">
                      Add
                    </Button>
                  </form>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-4 border-t">
              <Button type="button" variant="ghost" onClick={() => void goBack()} disabled={step <= 1}>
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                type="button"
                className="bg-gradient-primary text-primary-foreground"
                onClick={() => void goNext()}
              >
                {step === 4 ? "Finish & enter app" : "Continue"}
                {step < 4 && <ChevronRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
