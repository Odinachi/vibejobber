import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function FirebaseSetupPage() {
  return (
    <div className="min-h-screen bg-gradient-hero flex flex-col">
      <header className="container flex h-16 items-center">
        <Logo />
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-lg w-full shadow-elegant">
          <CardHeader>
            <CardTitle className="font-display">Connect Firebase</CardTitle>
            <CardDescription>
              Vibejobber stores your profile, applications, and documents in Cloud Firestore and uses Firebase
              Authentication. Add your web app keys to the frontend environment to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ol className="list-decimal pl-4 space-y-2">
              <li>
                In the{" "}
                <a className="text-primary underline" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
                  Firebase console
                </a>
                , create or open a project.
              </li>
              <li>Add a Web app and copy the config into <code className="text-foreground">frontend/.env</code> (see <code className="text-foreground">.env.example</code>).</li>
              <li>
                Enable Authentication: turn on <strong className="text-foreground">Google</strong> and{" "}
                <strong className="text-foreground">Apple</strong> (Apple requires a Services ID and key in the Apple
                Developer portal, then paste them in Firebase). Create a Firestore database.
              </li>
              <li>Deploy the rules in <code className="text-foreground">frontend/firestore.rules</code> (see <code className="text-foreground">frontend/firebase.json</code>).</li>
              <li>
                Add a top-level <code className="text-foreground">jobs</code> collection: each document ID is the job id;
                fields should match the app&apos;s job model (e.g. <code className="text-foreground">title</code>,{" "}
                <code className="text-foreground">company</code>, <code className="text-foreground">description</code>,{" "}
                <code className="text-foreground">requirements</code>, <code className="text-foreground">postedAt</code> ISO
                string, <code className="text-foreground">tags</code> array, etc.). Signed-in users can read jobs; writes
                are disabled in rules (use the console or Admin SDK to publish listings).
              </li>
            </ol>
            <p className="text-xs">
              After saving <code className="text-foreground">.env</code>, restart the Vite dev server.
            </p>
            <p className="text-xs border-t pt-3 mt-3">
              If the browser console shows <code className="text-foreground">ERR_BLOCKED_BY_CLIENT</code> on{" "}
              <code className="text-foreground">firestore.googleapis.com</code>, an extension (often an ad blocker) is
              blocking Firestore. Disable it for this site or allowlist Google APIs. The app also uses long-polling to
              reduce how often that happens.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
