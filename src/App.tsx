// Which screen to show: first-run setup, the licence screen, sign-in, start of shift, or the app.
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./state";
import { Loading } from "./components/ui";
import { Layout } from "./components/Layout";
import { Setup } from "./pages/Setup";
import { Login } from "./pages/Login";
import { LicenseGate } from "./pages/License";
import { ShiftStart } from "./pages/ShiftStart";
import { Dashboard } from "./pages/Dashboard";
import { Bookings } from "./pages/Bookings";
import { NewBooking } from "./pages/NewBooking";
import { BookingDetail } from "./pages/BookingDetail";
import { Calendar } from "./pages/Calendar";
import { Guests, GuestDetail } from "./pages/Guests";
import { Payments } from "./pages/Payments";
import { Housekeeping } from "./pages/Housekeeping";
import { WhatsApp } from "./pages/WhatsApp";
import { Reports } from "./pages/Reports";
import { Rooms } from "./pages/Rooms";
import { StaffPage } from "./pages/Staff";
import { SettingsPage } from "./pages/Settings";
import { Help } from "./pages/Help";
import { PrintView } from "./print/PrintView";

export function App() {
  const { info, session, settings, can } = useApp();
  const location = useLocation();

  // Print windows show only the document.
  if (location.pathname.startsWith("/print/")) {
    return (
      <Routes>
        <Route path="/print/:kind/:id" element={<PrintView />} />
      </Routes>
    );
  }

  if (!info || !settings) return <Loading text="Opening your hotel…" />;
  if (info.firstRun) return <Setup />;
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
    </Layout>
  );
}
