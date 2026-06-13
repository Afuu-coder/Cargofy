import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { LandingPage }      from './pages/marketing/LandingPage';
import { PricingPage }      from './pages/marketing/PricingPage';
import { AboutPage }        from './pages/marketing/AboutPage';
import { ProductPage }      from './pages/marketing/ProductPage';
import { SolutionsPage }    from './pages/marketing/SolutionsPage';
import { CustomersPage }    from './pages/marketing/CustomersPage';

/* ── Auth pages ─────────────────────────────────────────────────────────────── */
import { LoginPage }        from './pages/Login';
import { SignupPage }       from './pages/Signup';

/* ── Cargofy Command Hub pages ──────────────────────────────────────────────── */
import { ControlTower }         from './pages/axon/ControlTower';
import { ActiveShipments }      from './pages/axon/ActiveShipments';
import { AlertsCenter }         from './pages/axon/AlertsCenter';
import { AxonAnalytics }        from './pages/axon/AxonAnalytics';
import { CreateShipmentBasics } from './pages/axon/CreateShipmentBasics';
import { CreateShipmentReview } from './pages/axon/CreateShipmentReview';
import { FleetAndDrivers }      from './pages/axon/FleetAndDrivers';
import { IoTSimulator }         from './pages/axon/IoTSimulator';
import { LiveTracking }         from './pages/axon/LiveTracking';
import { RiskInterventions }    from './pages/axon/RiskInterventions';
import { ShipmentDetailAxon }   from './pages/axon/ShipmentDetailAxon';
import { ShipmentLaunched }     from './pages/axon/ShipmentLaunched';

/* ── Auth guard ──────────────────────────────────────────────────────────────── */
const isAuthed = () => localStorage.getItem('cargofy_authed') === 'true';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return <>{children}</>;
};



function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '13px',
          },
        }}
      />
      <Routes>

        {/* ── Marketing ────────────────────────────────────────────────────── */}
        <Route path="/"                element={<LandingPage />} />
        <Route path="/product"         element={<ProductPage />} />
        <Route path="/solutions"       element={<SolutionsPage />} />
        <Route path="/solutions/:slug" element={<SolutionsPage />} />
        <Route path="/customer-stories"       element={<CustomersPage />} />
        <Route path="/customer-stories/:slug" element={<CustomersPage />} />
        <Route path="/pricing"         element={<PricingPage />} />
        <Route path="/about"           element={<AboutPage />} />

        {/* ── Auth ─────────────────────────────────────────────────────────── */}
        <Route path="/login"  element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        {/* ── Dashboard (Cargofy Command Hub) ────────────────────────────────── */}
        <Route path="/dashboard"              element={<ProtectedRoute><ControlTower /></ProtectedRoute>} />
        <Route path="/control-tower"          element={<ProtectedRoute><ControlTower /></ProtectedRoute>} />
        <Route path="/active-shipments"       element={<ProtectedRoute><ActiveShipments /></ProtectedRoute>} />
        <Route path="/shipments"              element={<ProtectedRoute><ActiveShipments /></ProtectedRoute>} />
        <Route path="/alerts-center"          element={<ProtectedRoute><AlertsCenter /></ProtectedRoute>} />
        <Route path="/alerts"                 element={<ProtectedRoute><AlertsCenter /></ProtectedRoute>} />
        <Route path="/axon-analytics"         element={<ProtectedRoute><AxonAnalytics /></ProtectedRoute>} />
        <Route path="/analytics"              element={<ProtectedRoute><AxonAnalytics /></ProtectedRoute>} />
        <Route path="/create-shipment"        element={<ProtectedRoute><CreateShipmentBasics /></ProtectedRoute>} />
        <Route path="/create-shipment/review" element={<ProtectedRoute><CreateShipmentReview /></ProtectedRoute>} />
        <Route path="/shipments/new"          element={<ProtectedRoute><CreateShipmentBasics /></ProtectedRoute>} />
        <Route path="/fleet"                  element={<ProtectedRoute><FleetAndDrivers /></ProtectedRoute>} />
        <Route path="/iot-simulator"          element={<ProtectedRoute><IoTSimulator /></ProtectedRoute>} />
        <Route path="/simulator"              element={<ProtectedRoute><IoTSimulator /></ProtectedRoute>} />
        <Route path="/live-tracking"          element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
        <Route path="/map"                    element={<ProtectedRoute><LiveTracking /></ProtectedRoute>} />
        <Route path="/risk"                   element={<ProtectedRoute><RiskInterventions /></ProtectedRoute>} />
        <Route path="/shipment-detail"        element={<ProtectedRoute><ShipmentDetailAxon /></ProtectedRoute>} />
        <Route path="/shipments/:id"          element={<ProtectedRoute><ShipmentDetailAxon /></ProtectedRoute>} />
        <Route path="/shipment-launched"      element={<ProtectedRoute><ShipmentLaunched /></ProtectedRoute>} />

        {/* ── Catch-all ─────────────────────────────────────────────────────── */}
        <Route path="*" element={<Navigate to={isAuthed() ? '/dashboard' : '/'} replace />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
