import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/** Redirect when Firebase env is not configured. */
export function RequireFirebase({ children }: { children: React.ReactNode }) {
  const { configured } = useAuth();
  if (!configured) {
    return <Navigate to="/firebase-setup" replace />;
  }
  return <>{children}</>;
}
