import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantBorder = {
  default: "border-l-primary",
  success: "border-l-success",
  warning: "border-l-warning",
  destructive: "border-l-destructive",
};

const variantIconBg = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function KpiCard({ title, value, icon: Icon, trend, variant = "default" }: KpiCardProps) {
  return (
    <Card className={`border-l-4 ${variantBorder[variant]} shadow-sm hover:shadow-md transition-shadow duration-200`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`p-3 rounded-full ${variantIconBg[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
