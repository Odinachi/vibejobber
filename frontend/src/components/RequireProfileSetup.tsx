import { Navigate } from "react-router-dom";
import { useStore } from "@/lib/store";
import { Loader2 } from "lucide-react";

/**
 * After auth, block the main app until Firestore has synced and `profileSetup.completed` is true.
 * Incomplete users are sent to `/complete-profile` (resume at `profileSetup.currentStep`).
 */
export function RequireProfileSetup({ children }: { children: React.ReactNode }) {
  const synced = useStore((s) => s.firestoreSynced);
  const done = useStore((s) => s.profileSetup.completed);

  if (!synced) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Loading your data" />
      </div>
    );
  }

  if (!done) {
    return <Navigate to="/complete-profile" replace />;
  }

  return <>{children}</>;
}
