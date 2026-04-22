import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireFirebase } from "@/components/RequireFirebase";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import JobsList from "./pages/JobsList";
import JobDetail from "./pages/JobDetail";
import ApplicationsPage from "./pages/ApplicationsPage";
import DocumentsPage from "./pages/DocumentsPage";
import ProfilePage from "./pages/ProfilePage";
import PreferencesPage from "./pages/PreferencesPage";
import LoginPage from "./pages/LoginPage";
import CompleteProfilePage from "./pages/CompleteProfilePage";
import FirebaseSetupPage from "./pages/FirebaseSetupPage";
import { RequireProfileSetup } from "./components/RequireProfileSetup";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/firebase-setup" element={<FirebaseSetupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/complete-profile"
              element={
                <RequireFirebase>
                  <RequireAuth>
                    <CompleteProfilePage />
                  </RequireAuth>
                </RequireFirebase>
              }
            />
            <Route
              path="/app"
              element={
                <RequireFirebase>
                  <RequireAuth>
                    <RequireProfileSetup>
                      <AppLayout />
                    </RequireProfileSetup>
                  </RequireAuth>
                </RequireFirebase>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="jobs" element={<JobsList />} />
              <Route path="jobs/:id" element={<JobDetail />} />
              <Route path="applications" element={<ApplicationsPage />} />
              <Route path="documents" element={<DocumentsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="preferences" element={<PreferencesPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
