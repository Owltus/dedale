import { PageHeader } from "@/components/layout";
import { EtablissementTab } from "./EtablissementTab";

export function Parametres() {
  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Paramètres" />
      <EtablissementTab />
    </div>
  );
}
