import { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  PlusCircle,
  User,
  LogOut,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/listings/new", label: "New Listing", icon: PlusCircle },
  { to: "/account", label: "Account", icon: User },
] as const;

export default function Layout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  function handleNavClick() {
    setMobileOpen(false);
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile header bar */}
      <div className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center border-b bg-card px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <h1 className="ml-3 text-lg font-bold tracking-tight">SnapCard</h1>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-56 flex-col border-r bg-card transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand — hidden on mobile (mobile has its own header) */}
        <div className="hidden border-b px-4 py-4 md:block">
          <h1 className="text-lg font-bold tracking-tight">SnapCard</h1>
        </div>

        {/* Spacer for mobile header */}
        <div className="h-14 md:hidden" />

        {/* Nav links */}
        <nav className="flex-1 space-y-1 px-2 py-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/listings/new"}
              onClick={handleNavClick}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t px-3 py-3">
          <p className="truncate text-xs text-muted-foreground">
            {user?.email ?? ""}
          </p>
          <button
            onClick={handleSignOut}
            className="mt-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
