import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import CreateListing from "@/pages/CreateListing";
import BatchUpload from "@/pages/BatchUpload";
import ListingDetail from "@/pages/ListingDetail";
import Onboarding from "@/pages/Onboarding";
import EbayCallback from "@/pages/EbayCallback";
import Account from "@/pages/Account";
import { Loader2 } from "lucide-react";
import { supabaseConfigError } from "@/lib/supabase";

const queryClient = new QueryClient();

function LandingOrRedirect() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading SnapCard...
        </div>
      </div>
    );
  }
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <Landing />;
}

function ConfigErrorScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-lg rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive shadow-sm">
        <p className="font-semibold">SnapCard could not start</p>
        <p className="mt-2">{supabaseConfigError}</p>
      </div>
    </div>
  );
}

function App() {
  if (supabaseConfigError) {
    return <ConfigErrorScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Onboarding — protected but no sidebar (standalone layout) */}
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Onboarding />
              </ProtectedRoute>
            }
          />

          {/* eBay OAuth callback — protected (needs auth token to exchange code) */}
          <Route
            path="/auth/ebay-callback"
            element={
              <ProtectedRoute>
                <EbayCallback />
              </ProtectedRoute>
            }
          />

          {/* App routes — protected with sidebar layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/listings/new" element={<CreateListing />} />
            <Route path="/listings/batch" element={<BatchUpload />} />
            <Route path="/listings/:id" element={<ListingDetail />} />
            <Route path="/account" element={<Account />} />
          </Route>

          {/* Landing page — public, redirects to dashboard if authenticated */}
          <Route path="/" element={<LandingOrRedirect />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
