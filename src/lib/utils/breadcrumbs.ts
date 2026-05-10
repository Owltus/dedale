import type { BreadcrumbCrumb } from "@/components/layout/breadcrumb-context";
import type { DomaineGamme, FamilleGamme, Gamme } from "@/lib/types/gammes";

export function buildGammeBreadcrumb(domaine: DomaineGamme, famille: FamilleGamme, gamme: Gamme): BreadcrumbCrumb[] {
  return [
    { label: "Gammes", path: "/gammes" },
    { label: domaine.nom_domaine, path: `/gammes/domaines/${domaine.id_domaine_gamme}` },
    { label: famille.nom_famille, path: `/gammes/familles/${famille.id_famille_gamme}` },
    { label: gamme.nom_gamme, path: `/gammes/${gamme.id_gamme}` },
  ];
}
