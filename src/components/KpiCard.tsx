import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "success" | "warning" | "destructive";
}

const variantStyles = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

export function KpiCard({ title, value, icon: Icon, trend, variant = "default" }: KpiCardProps) {
  return (
    <Card className="shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {trend && <p className="text-xs text-muted-foreground">{trend}</p>}
          </div>
          <div className={`p-2.5 rounded-lg ${variantStyles[variant]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
