import { useState } from "react";
import { useStore, store } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import type { JobType, WorkMode } from "@/lib/types";
import { toast } from "sonner";

const ALL_MODES: WorkMode[] = ["remote", "hybrid", "onsite"];
const ALL_TYPES: JobType[] = ["full-time", "part-time", "contract", "internship"];

export default function PreferencesPage() {
  const prefs = useStore((s) => s.preferences);
  const [role, setRole] = useState("");
  const [loc, setLoc] = useState("");

  return (
    <div className="animate-fade-in pb-12">
      <PageHeader
        title="Preferences"
        description="What kind of role are you looking for? Used by AI to rank jobs."
      />

      <div className="p-6 space-y-6 max-w-3xl">
        <Card>
          <CardContent className="p-6 space-y-5">
            <div>
              <Label className="text-sm font-semibold">Desired roles</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {prefs.desiredRoles.map((r) => (
                  <Badge key={r} variant="secondary" className="gap-1.5 pr-1">
                    {r}
                    <button
                      onClick={() =>
                        void store.updatePreferences({ desiredRoles: prefs.desiredRoles.filter((x) => x !== r) })
                      }
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (role.trim()) {
                    void store.updatePreferences({ desiredRoles: [...prefs.desiredRoles, role.trim()] });
                    setRole("");
                  }
                }}
              >
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Senior Frontend Engineer" className="max-w-sm" />
                <Button type="submit" variant="outline">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </form>
            </div>

            <div>
              <Label className="text-sm font-semibold">Preferred locations</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {prefs.locations.map((l) => (
                  <Badge key={l} variant="secondary" className="gap-1.5 pr-1">
                    {l}
                    <button
                      onClick={() => void store.updatePreferences({ locations: prefs.locations.filter((x) => x !== l) })}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (loc.trim()) {
                    void store.updatePreferences({ locations: [...prefs.locations, loc.trim()] });
                    setLoc("");
                  }
                }}
              >
                <Input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="e.g. Remote (EU)" className="max-w-sm" />
                <Button type="submit" variant="outline">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </form>
            </div>

            <div>
              <Label className="text-sm font-semibold">Work mode</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_MODES.map((m) => {
                  const active = prefs.workModes.includes(m);
                  return (
                    <Button
                      key={m}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={active ? "bg-primary" : ""}
                      onClick={() =>
                        void store.updatePreferences({
                          workModes: active ? prefs.workModes.filter((x) => x !== m) : [...prefs.workModes, m],
                        })
                      }
                    >
                      {m}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-sm font-semibold">Job types</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_TYPES.map((t) => {
                  const active = prefs.jobTypes.includes(t);
                  return (
                    <Button
                      key={t}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      className={active ? "bg-primary" : ""}
                      onClick={() =>
                        void store.updatePreferences({
                          jobTypes: active ? prefs.jobTypes.filter((x) => x !== t) : [...prefs.jobTypes, t],
                        })
                      }
                    >
                      {t}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Minimum salary</Label>
                <Input
                  type="number"
                  value={prefs.salaryMin}
                  onChange={(e) => void store.updatePreferences({ salaryMin: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Currency</Label>
                <Input
                  value={prefs.salaryCurrency}
                  onChange={(e) => void store.updatePreferences({ salaryCurrency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </div>
            </div>

            <div className="pt-2 border-t flex justify-between items-center">
              <p className="text-xs text-muted-foreground">Changes save automatically.</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void store.reset().then(
                    () => toast.success("Profile and preferences were reset in Firebase"),
                    (e) => toast.error(e instanceof Error ? e.message : "Reset failed"),
                  );
                }}
              >
                Reset all data
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
