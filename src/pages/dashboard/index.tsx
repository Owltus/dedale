import { useNavigate, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { CardList } from "@/components/shared/CardList";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, ClipboardList, FileText, Handshake } from "lucide-react";
import { OtDonutChart, statutsToSegments } from "./OtDonutChart";
import { GammeSunburst } from "./GammeSunburst";
import { PlanningChart } from "./PlanningChart";
import { useDashboard } from "@/hooks/use-dashboard";
import { DiStatusBadge, ContratStatusBadge } from "@/components/shared/StatusBadge";
import { stripExtension } from "@/lib/utils/format";
import type { DiDashboardItem, ContratDashboardItem, DocumentDashboardItem } from "@/lib/types/dashboard";

function filterDi(di: DiDashboardItem, q: string): boolean {
  return di.libelle_constat.toLowerCase().includes(q);
}

function filterContrat(c: ContratDashboardItem, q: string): boolean {
  return c.reference.toLowerCase().includes(q) || c.nom_prestataire.toLowerCase().includes(q);
}

function filterDocument(d: DocumentDashboardItem, q: string): boolean {
  return d.nom_original.toLowerCase().includes(q) || d.nom_type.toLowerCase().includes(q);
}

const ONBOARDING_STEPS = [
  { label: "Établissement", path: "/parametres", key: "has_etablissement" as const },
  { label: "Localisations", path: "/localisations", key: "has_localisations" as const },
  { label: "Équipements", path: "/equipements", key: "has_equipements" as const },
  { label: "Prestataires", path: "/prestataires", key: "has_prestataires" as const },
  { label: "Contrats", path: "/contrats", key: "has_contrats" as const },
  { label: "Gammes", path: "/gammes", key: "has_gammes" as const },
  { label: "Premier OT", path: "/ordres-travail", key: "has_ot" as const },
];

/// Dashboard — Tableau de bord synthétique
export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useDashboard();

  if (isLoading || !data) {
    return <div className="p-6"><p className="text-sm text-muted-foreground">Chargement du tableau de bord...</p></div>;
  }

  const showOnboarding = !data.has_ot;

  return (
    <div className="flex flex-1 flex-col p-6 gap-4 overflow-hidden">
      <PageHeader title="Tableau de bord" />

      {/* Alertes proactives */}
      {(data.contrats_expirant_30j.length > 0 || data.gammes_regl_sans_ot.length > 0 || data.ot_stagnants.length > 0) && (
        <div className="space-y-1.5 shrink-0">
          {data.contrats_expirant_30j.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <span className="ml-2">{data.contrats_expirant_30j.length} contrat(s) expirent dans les 30 prochains jours</span>
              <Button variant="link" size="sm" className="ml-2" onClick={() => navigate("/contrats")}>Voir</Button>
            </Alert>
          )}
          {data.gammes_regl_sans_ot.length > 0 && (
            <Alert>
              <AlertTriangle className="size-4" />
              <span className="ml-2">{data.gammes_regl_sans_ot.length} gamme(s) réglementaire(s) sans OT planifié</span>
              <Button variant="link" size="sm" className="ml-2" onClick={() => navigate("/gammes")}>Voir</Button>
            </Alert>
          )}
          {data.ot_stagnants.length > 0 && (
            <Alert>
              <AlertTriangle className="size-4" />
              <span className="ml-2">{data.ot_stagnants.length} OT en cours depuis plus de 30 jours</span>
            </Alert>
          )}
        </div>
      )}

      {/* Graphiques + KPIs */}
      <div className="flex gap-3 shrink-0">
        <OtDonutChart groups={[
          { label: "En retard", categorie: "en_retard", segments: [{ label: "En retard", value: data.nb_ot_en_retard, color: "hsl(0, 65%, 50%)" }] },
          { label: "Cette semaine", categorie: "cette_semaine", segments: statutsToSegments(data.ot_cette_semaine) },
          { label: "En cours", categorie: "en_cours", segments: [{ label: "En cours", value: data.nb_ot_en_cours, color: "hsl(215, 70%, 52%)" }] },
        ]} />
        <GammeSunburst />
        <PlanningChart />
      </div>

      {/* Listes : grille 3 colonnes qui remplit tout l'espace restant */}
      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        <CardList
          data={data.dernieres_di}
          getKey={(di) => di.id_di}
          getHref={(di) => `/demandes/${di.id_di}`}
          filterFn={filterDi}
          icon={<ClipboardList className="size-5 text-muted-foreground" />}
          title="Demandes d'intervention"
          showSearch={false}
          compact
          emptyTitle="Aucune demande"
          renderContent={(di) => (
            <p className="flex-1 text-[11px] leading-tight truncate">{di.libelle_constat}</p>
          )}
          renderRight={(di) => (
            <DiStatusBadge id={di.id_statut_di} className="h-4 text-[10px] px-1.5" />
          )}
        />
        <CardList
          data={data.contrats_dashboard}
          getKey={(c) => c.id_contrat}
          getHref={(c) => `/prestataires?contrat=${c.id_contrat}`}
          getImageId={(c) => c.id_image_prestataire}
          filterFn={filterContrat}
          icon={<Handshake className="size-5 text-muted-foreground" />}
          title="Contrats"
          showSearch={false}
          compact
          emptyTitle="Aucun contrat"
          renderContent={(c) => (
            <p className="flex-1 text-[11px] leading-tight truncate">{c.reference}</p>
          )}
          renderRight={(c) => (
            <ContratStatusBadge statut={c.statut} className="h-4 text-[10px] px-1.5" />
          )}
        />
        <CardList
          data={data.derniers_documents}
          getKey={(d) => d.id_document}
          getHref={(d) => `/documents?doc=${d.id_document}`}
          filterFn={filterDocument}
          icon={<FileText className="size-5 text-muted-foreground" />}
          title="Documents récents"
          showSearch={false}
          compact
          emptyTitle="Aucun document"
          renderContent={(d) => (
            <p className="flex-1 text-[11px] leading-tight truncate">{stripExtension(d.nom_original)}</p>
          )}
        />
      </div>

      {/* Onboarding */}
      {showOnboarding && (
        <Card className="shrink-0">
          <CardHeader className="py-3"><CardTitle>Premiers pas</CardTitle></CardHeader>
          <CardContent className="pb-3">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {ONBOARDING_STEPS.map((step, i) => (
                <div key={step.key} className="flex items-center gap-2">
                  {data[step.key] ? (
                    <CheckCircle className="size-4 text-green-600" />
                  ) : (
                    <span className="flex size-4 items-center justify-center rounded-full border text-[10px]">{i + 1}</span>
                  )}
                  <Link to={step.path} className="text-sm hover:underline">{step.label}</Link>
                  {data[step.key] && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Fait</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
