import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

export function NoCompanyScreen() {
  const queryClient = useQueryClient();
  const { setSelectedCompany, setCompanies } = useCompany();
  const [name, setName] = useState("");
  const [vatNumber, setVatNumber] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Utente non autenticato");

      const { data: company, error } = await supabase
        .from("companies")
        .insert({ name: name.trim(), vat_number: vatNumber.trim() || null })
        .select()
        .single();
      if (error) throw error;

      // Add current user as owner
      const { error: memberError } = await supabase
        .from("company_members")
        .insert({ company_id: company.id, user_id: userData.user.id, role: "owner" });
      if (memberError) {
        console.warn("company_members insert failed (RLS?):", memberError.message);
      }

      return company;
    },
    onSuccess: (company) => {
      setCompanies([company]);
      setSelectedCompany(company);
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast.success("Azienda creata con successo!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Benvenuto in FinFlow</CardTitle>
          <CardDescription>
            Per iniziare, crea la tua prima azienda. Potrai aggiungerne altre in seguito dalle Impostazioni.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">Nome azienda *</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Es. Rossi S.r.l."
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-vat">Partita IVA</Label>
            <Input
              id="company-vat"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              placeholder="IT00000000000"
              maxLength={20}
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            className="w-full"
          >
            {createMutation.isPending ? "Creazione..." : "Crea azienda"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
