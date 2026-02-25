import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  companyId: string;
}

export function QuarantenaTab({ companyId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: quarantined } = useQuery({
    queryKey: ["quarantined_files", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_import_files")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "quarantined")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!quarantined) return;
    if (selectedIds.size === quarantined.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(quarantined.map((i: any) => i.id)));
  };

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const items = quarantined?.filter((i: any) => ids.includes(i.id)) || [];
    try {
      const paths = items.map((i: any) => i.storage_path);
      if (paths.length > 0) await supabase.storage.from("invoice-imports").remove(paths);
      await supabase.from("invoice_import_files").delete().in("id", ids);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["quarantined_files"] });
      toast.success(`${ids.length} file eliminati`);
    } catch (e: any) {
      toast.error(`Errore: ${e.message}`);
    }
  };

  if (!quarantined || quarantined.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-12 text-center text-muted-foreground">
          Nessun file in quarantena
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{quarantined.length}+ file in quarantena</p>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <Button variant="destructive" size="sm" className="gap-1" onClick={bulkDelete}>
                <Trash2 className="h-3.5 w-3.5" /> Elimina selezionati ({selectedIds.size})
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/quarantena")}>
              Vai a Quarantena completa →
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={quarantined.length > 0 && selectedIds.size === quarantined.length} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>File</TableHead>
              <TableHead>Errore</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quarantined.map((item: any) => (
              <TableRow key={item.id}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} />
                </TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{item.filename}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">{item.error_code}</Badge>
                </TableCell>
                <TableCell className="text-sm">{formatDate(item.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
