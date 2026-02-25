import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

export function RegoleTab({ companyId }: { companyId?: string }) {
  const { data: rules } = useQuery({
    queryKey: ["reconciliation_rules", companyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("reconciliation_rules").select("*, chart_of_accounts(name), projects(name)").eq("company_id", companyId!);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  return (
    <Card className="shadow-sm">
      <CardHeader><CardTitle className="text-base">Regole di Riconciliazione</CardTitle></CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Pattern descrizione</TableHead><TableHead>Controparte</TableHead><TableHead>Categoria</TableHead><TableHead>Progetto</TableHead><TableHead className="text-right">Utilizzi</TableHead><TableHead>Attiva</TableHead></TableRow></TableHeader>
          <TableBody>
            {rules?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.description_pattern || "—"}</TableCell>
                <TableCell>{r.counterpart_name_pattern || "—"}</TableCell>
                <TableCell>{(r.chart_of_accounts as any)?.name || "—"}</TableCell>
                <TableCell>{(r.projects as any)?.name || "—"}</TableCell>
                <TableCell className="text-right">{r.usage_count}</TableCell>
                <TableCell><Switch checked={r.is_active} disabled /></TableCell>
              </TableRow>
            ))}
            {(!rules || rules.length === 0) && (<TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nessuna regola configurata</TableCell></TableRow>)}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}