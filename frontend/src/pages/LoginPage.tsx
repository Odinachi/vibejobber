import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function LoginPage() {
  const { signInWithGoogle, signInWithApple, configured, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || "/app";

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate(from, { replace: true });
  }, [user, loading, navigate, from]);

  if (!configured) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Button asChild>
          <Link to="/firebase-setup">Configure Firebase first</Link>
        </Button>
      </div>
    );
  }

  const runOAuth = async (fn: () => Promise<void>, label: string) => {
    setBusy(true);
    try {
      await fn();
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `${label} failed`;
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">Home</Link>
        </Button>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-elegant">
          <CardHeader>
            <CardTitle className="font-display text-2xl">Sign in</CardTitle>
            <CardDescription>
              Use Google or Apple. We&apos;ll sync your profile and applications to your Firebase project.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              disabled={busy}
              onClick={() => void runOAuth(signInWithGoogle, "Google sign-in")}
            >
              {busy ? "Signing in…" : "Continue with Google"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-11"
              disabled={busy}
              onClick={() => void runOAuth(signInWithApple, "Apple sign-in")}
            >
              {busy ? "Signing in…" : "Continue with Apple"}
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-2">
              First-time sign-in opens a short profile setup you can leave and resume anytime.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
