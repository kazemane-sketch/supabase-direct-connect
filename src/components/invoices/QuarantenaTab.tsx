import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import {
  parseInvoiceFromXmlString,
  extractXmlFromP7mBytes,
  stripBadUnicode,
  type ParsedInvoice,
} from "@/lib/xmlInvoiceParser";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Download, RotateCcw, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Props {
  companyId: string;
}

export function QuarantenaTab({ companyId }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
          <Button variant="outline" size="sm" onClick={() => navigate("/quarantena")}>
            Vai a Quarantena completa →
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Errore</TableHead>
              <TableHead>Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quarantined.map((item: any) => (
              <TableRow key={item.id}>
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
