import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantIcon = {
  default: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  destructive: "bg-destructive/15 text-destructive",
};

export function KpiCard({ title, value, icon: Icon, trend, variant = "default" }: KpiCardProps) {
  return (
    <Card className="group hover:scale-[1.02] hover:shadow-lg transition-all duration-200 border-0 shadow-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
            <p className="text-3xl font-extrabold tracking-tight leading-none">{value}</p>
            {trend && (
              <p className="text-sm font-medium text-muted-foreground">{trend}</p>
            )}
          </div>
          <div className={`p-3.5 rounded-2xl ${variantIcon[variant]} shrink-0`}>
            <Icon className="h-6 w-6" strokeWidth={2} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
