import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import { LandingPage } from "./pages/marketing/LandingPage";
import { PricingPage } from "./pages/marketing/PricingPage";
import { AboutPage } from "./pages/marketing/AboutPage";
import { ProductPage } from "./pages/marketing/ProductPage";
import { SolutionsPage } from "./pages/marketing/SolutionsPage";
import { CustomersPage } from "./pages/marketing/CustomersPage";

/* ── Auth pages ─────────────────────────────────────────────────────────────── */
import { LoginPage } from "./pages/auth/Login";
import { SignupPage } from "./pages/auth/Signup";

/* ── Cargofy Command Hub pages ──────────────────────────────────────────────── */
import { ControlTower } from "./pages/dashboard/ControlTower";
import { ActiveShipments } from "./pages/dashboard/ActiveShipments";
import { AlertsCenter } from "./pages/dashboard/AlertsCenter";
import { CargofyAnalytics } from "./pages/dashboard/CargofyAnalytics";
import { CreateShipmentBasics } from "./pages/dashboard/CreateShipmentBasics";
import { CreateShipmentReview } from "./pages/dashboard/CreateShipmentReview";
import { FleetAndDrivers } from "./pages/dashboard/FleetAndDrivers";
import { MobileIoTController } from "./pages/MobileIoTController";

import { LiveTracking } from "./pages/dashboard/LiveTracking";
import { RiskInterventions } from "./pages/dashboard/RiskInterventions";
import { ShipmentDetail } from "./pages/dashboard/ShipmentDetail";
import { ShipmentLaunched } from "./pages/dashboard/ShipmentLaunched";
import { Fleet3DView } from "./pages/dashboard/Fleet3DView";

import { supabase } from "./lib/supabase";

/* ── Auth guard ──────────────────────────────────────────────────────────────── */
// cargofy_authed is set by Login/Signup on successful Supabase auth.
export const isAuthed = () => localStorage.getItem("cargofy_authed") === "true";

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [loading, setLoading] = React.useState(true);
  const [authed, setAuthed] = React.useState(isAuthed());

  React.useEffect(() => {
    // Check current session immediately
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setLoading(false);
    });

    // Listen for changes (like OAuth redirects)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthed(!!session);
      if (session) {
        localStorage.setItem("cargofy_authed", "true");
        localStorage.setItem("cargofy_token", session.access_token);
        localStorage.setItem("cargofy_email", session.user.email || "");
        localStorage.setItem(
          "cargofy_user",
          JSON.stringify({
            id: session.user.id,
            email: session.user.email,
            name:
              session.user.user_metadata?.full_name ||
              session.user.email?.split("@")[0],
            avatar: session.user.user_metadata?.avatar_url || null,
          }),
        );
      } else {
        localStorage.removeItem("cargofy_authed");
        localStorage.removeItem("cargofy_token");
        localStorage.removeItem("cargofy_email");
        localStorage.removeItem("cargofy_user");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050810] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#4DD9AC]/20 border-t-[#4DD9AC] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!authed) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#1e293b",
            color: "#f1f5f9",
            border: "1px solid #334155",
            borderRadius: "12px",
            fontSize: "13px",
          },
        }}
      />
      <Routes>
        {/* ── Marketing ────────────────────────────────────────────────────── */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/product" element={<ProductPage />} />
        <Route path="/solutions" element={<SolutionsPage />} />
        <Route path="/solutions/:slug" element={<SolutionsPage />} />
        <Route path="/customer-stories" element={<CustomersPage />} />
        <Route path="/customer-stories/:slug" element={<CustomersPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* ── Auth ─────────────────────────────────────────────────────────── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* ── Dashboard (Cargofy Command Hub) ────────────────────────────────── */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <ControlTower />
            </ProtectedRoute>
          }
        />
        <Route
          path="/control-tower"
          element={
            <ProtectedRoute>
              <ControlTower />
            </ProtectedRoute>
          }
        />
        <Route
          path="/active-shipments"
          element={
            <ProtectedRoute>
              <ActiveShipments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipments"
          element={
            <ProtectedRoute>
              <ActiveShipments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/alerts-center"
          element={
            <ProtectedRoute>
              <AlertsCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/alerts"
          element={
            <ProtectedRoute>
              <AlertsCenter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/cargofy-analytics"
          element={
            <ProtectedRoute>
              <CargofyAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <CargofyAnalytics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-shipment"
          element={
            <ProtectedRoute>
              <CreateShipmentBasics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-shipment/review"
          element={
            <ProtectedRoute>
              <CreateShipmentReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipments/new"
          element={
            <ProtectedRoute>
              <CreateShipmentBasics />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fleet"
          element={
            <ProtectedRoute>
              <FleetAndDrivers />
            </ProtectedRoute>
          }
        />
        {/* /mobile — no auth guard, phone opens directly via QR */}
        <Route path="/mobile" element={<MobileIoTController />} />

        <Route
          path="/live-tracking"
          element={
            <ProtectedRoute>
              <LiveTracking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/map"
          element={
            <ProtectedRoute>
              <LiveTracking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/risk"
          element={
            <ProtectedRoute>
              <RiskInterventions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipment-detail"
          element={
            <ProtectedRoute>
              <ShipmentDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipments/:id"
          element={
            <ProtectedRoute>
              <ShipmentDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/shipment-launched"
          element={
            <ProtectedRoute>
              <ShipmentLaunched />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fleet-3d"
          element={
            <ProtectedRoute>
              <Fleet3DView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/3d-map"
          element={
            <ProtectedRoute>
              <Fleet3DView />
            </ProtectedRoute>
          }
        />

        {/* ── Catch-all ─────────────────────────────────────────────────────── */}
        <Route
          path="*"
          element={<Navigate to={isAuthed() ? "/dashboard" : "/"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
