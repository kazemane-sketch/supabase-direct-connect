import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { NoCompanyScreen } from "./NoCompanyScreen";
import { useCompany } from "@/hooks/useCompany";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { selectedCompany, setSelectedCompany, setCompanies } = useCompany();

  const { data: companiesData, isLoading } = useQuery({
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

  const noCompanies = !isLoading && (!companiesData || companiesData.length === 0);

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">Caricamento...</div>
          ) : noCompanies ? (
            <NoCompanyScreen />
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
