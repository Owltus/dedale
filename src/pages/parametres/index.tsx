import { PageHeader } from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EtablissementTab } from "./EtablissementTab";
import { SauvegardeTab } from "./SauvegardeTab";

export function Parametres() {
  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Paramètres" />
      <Tabs defaultValue="etablissement" className="flex flex-col flex-1 overflow-hidden gap-3">
        <TabsList className="self-start">
          <TabsTrigger value="etablissement">Établissement</TabsTrigger>
          <TabsTrigger value="sauvegarde">Sauvegarde</TabsTrigger>
        </TabsList>
        <TabsContent value="etablissement" className="overflow-auto">
          <EtablissementTab />
        </TabsContent>
        <TabsContent value="sauvegarde" className="overflow-auto">
          <SauvegardeTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
