import { useCompany } from "@/hooks/useCompany";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AziendeTab } from "@/components/settings/AziendeTab";
import { ContiBancariTab } from "@/components/settings/ContiBancariTab";
import { PianoContiTab } from "@/components/settings/PianoContiTab";
import { ProgettiTab } from "@/components/settings/ProgettiTab";
import { RegoleTab } from "@/components/settings/RegoleTab";
import { ProdottiTab } from "@/components/settings/ProdottiTab";

export default function Impostazioni() {
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Impostazioni</h2>

      <Tabs defaultValue="aziende">
        <TabsList>
          <TabsTrigger value="aziende">Aziende</TabsTrigger>
          <TabsTrigger value="conti">Conti Bancari</TabsTrigger>
          <TabsTrigger value="piano">Piano dei Conti</TabsTrigger>
          <TabsTrigger value="progetti">Progetti</TabsTrigger>
          <TabsTrigger value="prodotti">Prodotti</TabsTrigger>
          <TabsTrigger value="regole">Regole Riconciliazione</TabsTrigger>
        </TabsList>

        <TabsContent value="aziende"><AziendeTab /></TabsContent>
        <TabsContent value="conti"><ContiBancariTab /></TabsContent>
        <TabsContent value="piano"><PianoContiTab companyId={companyId} /></TabsContent>
        <TabsContent value="progetti"><ProgettiTab companyId={companyId} /></TabsContent>
        <TabsContent value="prodotti"><ProdottiTab companyId={companyId} /></TabsContent>
        <TabsContent value="regole"><RegoleTab companyId={companyId} /></TabsContent>
      </Tabs>
    </div>
  );
}