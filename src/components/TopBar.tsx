import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function TopBar() {
  const { selectedCompany, setSelectedCompany, companies, setCompanies } = useCompany();
  const navigate = useNavigate();

  const { data: companiesData } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (companiesData && companiesData.length > 0) {
      setCompanies(companiesData);
      if (!selectedCompany) {
        setSelectedCompany(companiesData[0]);
      }
    }
  }, [companiesData]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-4">
        <Select
          value={selectedCompany?.id || ""}
          onValueChange={(val) => {
            const c = companies.find((c) => c.id === val);
            if (c) setSelectedCompany(c);
          }}
        >
          <SelectTrigger className="w-64 bg-background">
            <SelectValue placeholder="Seleziona azienda" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">U</AvatarFallback>
        </Avatar>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Esci">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
