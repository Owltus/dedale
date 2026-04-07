import { useNavigate, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { StatCard } from "@/components/shared/StatCard";
import { CardList } from "@/components/shared/CardList";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, ClipboardList, Wrench } from "lucide-react";
import { useDashboard } from "@/hooks/use-dashboard";
import { OtStatusBadge, DiStatusBadge } from "@/components/shared/StatusBadge";
import { formatDate } from "@/lib/utils/format";
import type { OtDashboardItem, DiDashboardItem } from "@/lib/types/dashboard";

function filterOt(ot: OtDashboardItem, q: string): boolean {
  return ot.nom_gamme.toLowerCase().includes(q) || ot.nom_prestataire?.toLowerCase().includes(q) || false;
}

function filterDi(di: DiDashboardItem, q: string): boolean {
  return di.libelle_constat.toLowerCase().includes(q) || false;
}

function renderOtContent(ot: OtDashboardItem) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium truncate">{ot.nom_gamme}</p>
      <p className="text-xs text-muted-foreground truncate">{ot.nom_prestataire ?? "\u00A0"}</p>
    </div>
  );
}

function renderOtRight(ot: OtDashboardItem) {
  return (
    <div className="flex flex-col items-center gap-1 w-28 shrink-0">
      <OtStatusBadge id={ot.id_statut_ot} />
      <span className="text-xs text-muted-foreground">{formatDate(ot.date_prevue)}</span>
    </div>
  );
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
    <div className="flex flex-1 flex-col p-6 space-y-6 overflow-y-auto no-scrollbar">
      <PageHeader title="Tableau de bord" />

      {/* Alertes proactives */}
      {(data.contrats_expirant_30j.length > 0 || data.gammes_regl_sans_ot.length > 0 || data.ot_stagnants.length > 0) && (
        <div className="space-y-2">
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

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="OT en retard" value={data.nb_ot_en_retard} variant="destructive" />
        <StatCard label="OT cette semaine" value={data.nb_ot_cette_semaine} variant="warning" />
        <StatCard label="DI ouvertes" value={data.nb_di_ouvertes} />
        <StatCard label="Contrats à risque" value={data.nb_contrats_a_risque} variant="destructive" />
      </div>

      {/* Listes : OT + DI */}
      <div className="grid grid-cols-2 gap-6 max-h-[50vh]">
        <CardList
          data={data.prochains_ot}
          getKey={(ot) => ot.id_ordre_travail}
          getHref={(ot) => `/ordres-travail/${ot.id_ordre_travail}`}
          filterFn={filterOt}
          icon={<Wrench className="size-5 text-muted-foreground" />}
          title="Prochains OT"
          showSearch={false}
          emptyTitle="Aucun OT planifié"
          renderContent={renderOtContent}
          renderRight={renderOtRight}
        />
        <CardList
          data={data.dernieres_di}
          getKey={(di) => di.id_di}
          getHref={(di) => `/demandes/${di.id_di}`}
          filterFn={filterDi}
          icon={<ClipboardList className="size-5 text-muted-foreground" />}
          title="Dernières DI"
          showSearch={false}
          emptyTitle="Aucune demande"
          renderContent={(di) => (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{di.libelle_constat}</p>
              <p className="text-xs text-muted-foreground truncate">{formatDate(di.date_constat)}</p>
            </div>
          )}
          renderRight={(di) => (
            <DiStatusBadge id={di.id_statut_di} />
          )}
        />
      </div>

      {/* OT en retard */}
      {data.ot_en_retard.length > 0 && (
        <CardList
          className="max-h-[50vh]"
          data={data.ot_en_retard}
          getKey={(ot) => ot.id_ordre_travail}
          getHref={(ot) => `/ordres-travail/${ot.id_ordre_travail}`}
          filterFn={filterOt}
          icon={<Wrench className="size-5 text-muted-foreground" />}
          title={`OT en retard (${data.ot_en_retard.length})`}
          showSearch={false}
          emptyTitle=""
          renderContent={renderOtContent}
          renderRight={renderOtRight}
        />
      )}

      {/* Onboarding */}
      {showOnboarding && (
        <Card>
          <CardHeader><CardTitle>Premiers pas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ONBOARDING_STEPS.map((step, i) => (
                <div key={step.key} className="flex items-center gap-3">
                  {data[step.key] ? (
                    <CheckCircle className="size-5 text-green-600" />
                  ) : (
                    <span className="flex size-5 items-center justify-center rounded-full border text-xs">{i + 1}</span>
                  )}
                  <Link to={step.path} className="text-sm hover:underline">{step.label}</Link>
                  {data[step.key] && <Badge variant="secondary">Fait</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
