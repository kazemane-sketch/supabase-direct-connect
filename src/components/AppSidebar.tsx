import {
  LayoutDashboard,
  ArrowLeftRight,
  FileText,
  Users,
  CalendarClock,
  GitMerge,
  TrendingUp,
  BarChart3,
  ShieldAlert,
  Settings,
  Landmark,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Movimenti Bancari", url: "/movimenti", icon: ArrowLeftRight },
  { title: "Fatture", url: "/fatture", icon: FileText },
  { title: "Controparti", url: "/controparti", icon: Users },
  { title: "Scadenzario", url: "/scadenzario", icon: CalendarClock },
  { title: "Riconciliazione", url: "/riconciliazione", icon: GitMerge },
  { title: "Cashflow", url: "/cashflow", icon: TrendingUp },
  { title: "Analisi", url: "/analisi", icon: BarChart3 },
  { title: "Quarantena", url: "/quarantena", icon: ShieldAlert },
  { title: "Impostazioni", url: "/impostazioni", icon: Settings },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="w-[250px] min-h-screen bg-gradient-to-b from-sidebar to-[hsl(220,28%,11%)] flex flex-col shrink-0">
      {/* Logo */}
      <div className="px-6 py-7 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md">
          <Landmark className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight leading-none">
            FinFlow
          </h1>
          <p className="text-[10px] text-sidebar-foreground/50 mt-0.5 tracking-wide uppercase">Treasury Management</p>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.url ||
            (item.url !== "/" && location.pathname.startsWith(item.url));
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-150 ${
                isActive
                  ? "bg-primary text-primary-foreground font-semibold shadow-md shadow-primary/25"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              activeClassName=""
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-6 py-5 border-t border-white/5">
        <p className="text-[11px] text-sidebar-foreground/30 font-medium">FinFlow v1.0</p>
      </div>
    </aside>
  );
}
