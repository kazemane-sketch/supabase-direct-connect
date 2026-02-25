import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  unmatched: { label: "Non riconciliato", className: "bg-muted text-muted-foreground" },
  ai_suggested: { label: "Suggerito AI", className: "bg-warning/15 text-warning border-warning/30" },
  reconciled: { label: "Riconciliato", className: "bg-success/15 text-success border-success/30" },
  excluded: { label: "Escluso", className: "bg-muted text-muted-foreground" },
  unpaid: { label: "Non pagata", className: "bg-muted text-muted-foreground" },
  partial: { label: "Parziale", className: "bg-warning/15 text-warning border-warning/30" },
  paid: { label: "Pagata", className: "bg-success/15 text-success border-success/30" },
  overdue: { label: "Scaduta", className: "bg-destructive/15 text-destructive border-destructive/30" },
  active: { label: "Attivo", className: "bg-success/15 text-success border-success/30" },
  closed: { label: "Chiuso", className: "bg-muted text-muted-foreground" },
  suspended: { label: "Sospeso", className: "bg-warning/15 text-warning border-warning/30" },
  pending: { label: "In attesa", className: "bg-warning/15 text-warning border-warning/30" },
  approved: { label: "Approvato", className: "bg-success/15 text-success border-success/30" },
  rejected: { label: "Rifiutato", className: "bg-destructive/15 text-destructive border-destructive/30" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={`${config.className} text-xs font-medium`}>
      {config.label}
    </Badge>
  );
}
