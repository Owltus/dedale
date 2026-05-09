import { PageHeader } from "@/components/layout";
import { SauvegardeTab } from "./SauvegardeTab";

export function Parametres() {
  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Paramètres" />
      <div className="flex-1 overflow-auto">
        <SauvegardeTab />
      </div>
    </div>
  );
}
