import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import CreateListing from "@/pages/CreateListing";
import ListingDetail from "@/pages/ListingDetail";
import Onboarding from "@/pages/Onboarding";
import EbayCallback from "@/pages/EbayCallback";
import Account from "@/pages/Account";

const queryClient = new QueryClient();

function RootRedirect() {
  const done = localStorage.getItem("snapcard_onboarding_complete");
  return <Navigate to={done ? "/dashboard" : "/onboarding"} replace />;
}

function App() {
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
            <Route path="/listings/:id" element={<ListingDetail />} />
            <Route path="/account" element={<Account />} />
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
