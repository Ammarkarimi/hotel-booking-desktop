// The window frame: the menu on the left, the bar on top (search, new booking, who is signed in).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { BarChart3, BedDouble, CalendarRange, CircleHelp, DoorOpen, KeyRound, LayoutDashboard, Lock, LogOut, MessageCircle, Plus, Search, Settings, Sparkles, UserCog, Users, Wallet, Clock, ShieldCheck, Footprints } from "lucide-react";
import { useApp } from "../state";
import { cx, Button } from "./ui";
import { initials, label } from "../../shared/format";
import { durationLabel } from "../../shared/dates";
import { EndShiftDialog } from "./EndShiftDialog";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { Logo } from "./Logo";
import type { Permission } from "../../shared/format";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  perm?: Permission;
  end?: boolean;
}

const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: "Front desk",
    items: [
      { to: "/", label: "Dashboard", icon: <LayoutDashboard />, end: true, perm: "frontdesk" },
      { to: "/bookings", label: "Bookings", icon: <BedDouble />, perm: "frontdesk" },
      { to: "/calendar", label: "Room calendar", icon: <CalendarRange />, perm: "frontdesk" },
      { to: "/guests", label: "Guests", icon: <Users />, perm: "frontdesk" },
      { to: "/payments", label: "Payments", icon: <Wallet />, perm: "frontdesk" },
      { to: "/housekeeping", label: "Housekeeping", icon: <Sparkles />, perm: "housekeeping" },
      { to: "/whatsapp", label: "WhatsApp", icon: <MessageCircle />, perm: "frontdesk" },
    ],
  },
  {
    group: "Owner",
    items: [
      { to: "/reports", label: "Reports", icon: <BarChart3 />, perm: "reports" },
      { to: "/rooms", label: "Rooms & prices", icon: <DoorOpen />, perm: "rooms" },
      { to: "/staff", label: "Staff & sign-ins", icon: <UserCog />, perm: "staff" },
      { to: "/settings", label: "Settings", icon: <Settings />, perm: "settings" },
    ],
  },
];

export function Layout({ children }: { children: ReactNode }) {
  const { session, settings, info, can, signOut } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState(false);
  const [endShift, setEndShift] = useState(false);
  const [password, setPassword] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const staff = session!.staff;
  const lic = info?.license;

  useEffect(() => {
    const close = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenu(false);
    const keys = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.ctrlKey && e.key.toLowerCase() === "b" && can("frontdesk")) {
        e.preventDefault();
        navigate("/bookings/new");
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", keys);
    };
  }, [can, navigate]);

  return (
    <div className="flex h-full">
      <aside className="flex w-[218px] shrink-0 flex-col bg-brand-900 text-slate-300">
        <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
          <Logo className="size-8" />
          <div className="min-w-0">
            <p className="truncate text-[14px] leading-tight font-semibold text-white">{settings?.hotelName || "My Hotel"}</p>
            <p className="text-[11px] text-slate-400">Innvela Hotel Desk</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3">
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.perm || can(i.perm));
            if (!items.length) return null;
            return (
              <div key={g.group} className="mt-3">
                <p className="px-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-slate-500 uppercase">{g.group}</p>
                {items.map((i) => (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.end}
                    className={({ isActive }) =>
                      cx("flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13.5px] [&>svg]:size-[17px]", isActive ? "bg-white/12 font-medium text-white" : "text-slate-300 hover:bg-white/6 hover:text-white")
                    }
                  >
                    {i.icon}
                    {i.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-2 py-2">
          <NavLink to="/help" className={({ isActive }) => cx("flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] [&>svg]:size-4", isActive ? "bg-white/12 text-white" : "text-slate-400 hover:text-white")}>
            <CircleHelp /> Help & shortcuts
          </NavLink>
          {lic && (
            <p className={cx("mt-1 flex items-center gap-1.5 px-2.5 text-[11px]", lic.state === "active" ? "text-slate-500" : "text-amber-300")}>
              <ShieldCheck className="size-3.5" />
              {lic.state === "trial" ? `Trial · ${lic.daysLeft} days left` : lic.state === "active" ? `Licensed · ${label(lic.plan)}` : "Licence ending"}
            </p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          {can("frontdesk") && (
            <form
              className="relative w-full max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                if (search.trim()) navigate(`/bookings?search=${encodeURIComponent(search.trim())}`);
              }}
            >
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a booking: name, phone, booking no., room, invoice…  (Ctrl+K)"
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pr-3 pl-8 text-[13px] focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 focus:outline-none"
              />
            </form>
          )}
          <div className="ml-auto flex items-center gap-2">
            {can("frontdesk") && (
              <>
                <Button icon={<Footprints className="size-4" />} onClick={() => navigate("/bookings/new?walkin=1")}>
                  Walk-in
                </Button>
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate("/bookings/new")}>
                  New booking
                </Button>
              </>
            )}
            {session?.shift && (
              <span className="ml-1 hidden items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[12px] text-emerald-700 xl:flex" title="Your shift">
                <Clock className="size-3.5" /> On shift {durationLabel(session.shift.startedAt)}
              </span>
            )}
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenu(!menu)} className="flex items-center gap-2 rounded-md py-1 pr-2 pl-1 hover:bg-slate-100">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-600 text-[12px] font-semibold text-white">{initials(staff.name)}</span>
                <span className="text-left leading-tight">
                  <span className="block text-[13px] font-medium text-slate-800">{staff.name}</span>
                  <span className="block text-[11px] text-slate-500">{label(staff.role)}</span>
                </span>
              </button>
              {menu && (
                <div className="animate-pop absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl">
                  {session?.shift && (
                    <MenuItem icon={<LogOut />} onClick={() => (setMenu(false), setEndShift(true))}>
                      End my shift
                    </MenuItem>
                  )}
                  <MenuItem icon={<Lock />} onClick={() => (setMenu(false), void signOut())}>
                    {session?.shift ? "Switch user (shift continues)" : "Sign out"}
                  </MenuItem>
                  <MenuItem icon={<KeyRound />} onClick={() => (setMenu(false), setPassword(true))}>
                    Change my password
                  </MenuItem>
                </div>
              )}
            </div>
          </div>
        </header>
        {lic && lic.message && (lic.state !== "trial" || lic.daysLeft <= 5) && (
          <div className={cx("flex items-center gap-2 border-b px-4 py-1.5 text-[12.5px]", lic.state === "grace" || lic.daysLeft <= 3 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
            <ShieldCheck className="size-4" /> {lic.message}
            {can("license") && (
              <button className="ml-auto font-medium underline" onClick={() => navigate("/settings?tab=license")}>
                Enter licence key
              </button>
            )}
          </div>
        )}
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <EndShiftDialog open={endShift} onClose={() => setEndShift(false)} />
      <ChangePasswordDialog open={password} onClose={() => setPassword(false)} />
    </div>
  );
}

function MenuItem({ icon, children, onClick }: { icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-50 [&>svg]:size-4 [&>svg]:text-slate-400">
      {icon}
      {children}
    </button>
  );
}
