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
    <aside className="w-60 min-h-screen bg-sidebar flex flex-col border-r border-sidebar-border shrink-0">
      <div className="px-5 py-6">
        <h1 className="text-xl font-bold text-sidebar-primary-foreground tracking-tight">
          <span className="text-primary">Fin</span>Flow
        </h1>
        <p className="text-xs text-sidebar-foreground/50 mt-0.5">Gestione finanziaria PMI</p>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {navItems.map((item) => {
          const isActive = location.pathname === item.url ||
            (item.url !== "/" && location.pathname.startsWith(item.url));
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.url === "/"}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium shadow-sm border-l-2 border-white/60"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
              activeClassName=""
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-xs text-sidebar-foreground/40">FinFlow v1.0</p>
      </div>
    </aside>
  );
}
