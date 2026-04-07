import { PageHeader } from "@/components/layout";
import { OtList } from "@/components/shared/OtList";
import { useOrdresTravail } from "@/hooks/use-ordres-travail";

export function OrdresTravailList() {
  const { data: ots = [] } = useOrdresTravail();

  return (
    <div className="flex h-full flex-col p-4 gap-3 overflow-hidden">
      <PageHeader title="Ordres de travail">
        <div className="size-8" />
      </PageHeader>

      <OtList
        data={ots}
        emptyTitle="Aucun ordre de travail"
        emptyDescription="Les OT sont générés depuis les gammes de maintenance."
      />
    </div>
  );
}
