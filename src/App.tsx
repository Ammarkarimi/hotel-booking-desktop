// Which screen to show: first-run setup, the licence screen, sign-in, start of shift, or the app.
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./state";
import { Loading } from "./components/ui";
import { Layout } from "./components/Layout";
import { lazy, Suspense } from "react";
import { Login } from "./pages/Login";
import { LicenseGate } from "./pages/License";
import { ShiftStart } from "./pages/ShiftStart";
import { Dashboard } from "./pages/Dashboard";
import { Bookings } from "./pages/Bookings";
import { NewBooking } from "./pages/NewBooking";
import { BookingDetail } from "./pages/BookingDetail";
import { Guests, GuestDetail } from "./pages/Guests";
import { Housekeeping } from "./pages/Housekeeping";

// Screens used less often (and the charts and QR code libraries) load the first time they are opened.
const Setup = lazy(() => import("./pages/Setup").then((m) => ({ default: m.Setup })));
const Calendar = lazy(() => import("./pages/Calendar").then((m) => ({ default: m.Calendar })));
const Payments = lazy(() => import("./pages/Payments").then((m) => ({ default: m.Payments })));
const WhatsApp = lazy(() => import("./pages/WhatsApp").then((m) => ({ default: m.WhatsApp })));
const Reports = lazy(() => import("./pages/Reports").then((m) => ({ default: m.Reports })));
const Rooms = lazy(() => import("./pages/Rooms").then((m) => ({ default: m.Rooms })));
const StaffPage = lazy(() => import("./pages/Staff").then((m) => ({ default: m.StaffPage })));
const SettingsPage = lazy(() => import("./pages/Settings").then((m) => ({ default: m.SettingsPage })));
const Help = lazy(() => import("./pages/Help").then((m) => ({ default: m.Help })));
const PrintView = lazy(() => import("./print/PrintView").then((m) => ({ default: m.PrintView })));

export function App() {
  const { info, session, settings, can } = useApp();
  const location = useLocation();

  // Print windows show only the document.
  if (location.pathname.startsWith("/print/")) {
    return (
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/print/:kind/:id" element={<PrintView />} />
        </Routes>
      </Suspense>
    );
  }

  if (!info || !settings) return <Loading text="Opening your hotel…" />;
  if (info.firstRun)
    return (
      <Suspense fallback={<Loading />}>
        <Setup />
      </Suspense>
    );
  if (!info.license.canUse) return <LicenseGate />;
  if (!session) return <Login />;
  if (!session.shift && settings.staffShifts && (session.staff.role === "front_desk" || session.staff.role === "manager")) return <ShiftStart />;

  if (session.staff.role === "housekeeping") {
    return (
      <Layout>
        <Routes>
          <Route path="/housekeeping" element={<Housekeeping />} />
          <Route path="*" element={<Navigate to="/housekeeping" replace />} />
        </Routes>
      </Layout>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/bookings" element={<Bookings />} />
        <Route path="/bookings/new" element={<NewBooking />} />
        <Route path="/bookings/:id" element={<BookingDetail />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/guests" element={<Guests />} />
        <Route path="/guests/:id" element={<GuestDetail />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/housekeeping" element={<Housekeeping />} />
        <Route path="/whatsapp" element={<WhatsApp />} />
        {can("reports") && <Route path="/reports" element={<Reports />} />}
        {can("rooms") && <Route path="/rooms" element={<Rooms />} />}
        {can("staff") && <Route path="/staff" element={<StaffPage />} />}
        {can("settings") && <Route path="/settings" element={<SettingsPage />} />}
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </Layout>
  );
}
