import { useNavigate, Link } from "react-router-dom";
import { useRef, useState, useEffect } from "react";
import { PageHeader } from "@/components/layout";
import { CardList } from "@/components/shared/CardList";
import { useTemporalNavigation } from "@/hooks/useTemporalNavigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, AlertTriangle, CheckCircle, FileText } from "lucide-react";
import { OtDonutChart, statutsToSegments } from "./OtDonutChart";
import { GammeSunburst } from "./GammeSunburst";
import { PlanningChart } from "./PlanningChart";
import { ContratsTimeline } from "./ContratsTimeline";
import { useDashboard } from "@/hooks/use-dashboard";
import { DiStatusBadge, OtStatusBadge } from "@/components/shared/StatusBadge";
import { formatDateShort, stripExtension } from "@/lib/utils/format";
import type { DiDashboardItem, OtDashboardItem, DocumentDashboardItem } from "@/lib/types/dashboard";

function filterDi(di: DiDashboardItem, q: string): boolean {
  return di.libelle_constat.toLowerCase().includes(q);
}

function filterOtDoc(ot: OtDashboardItem, q: string): boolean {
  return ot.nom_gamme.toLowerCase().includes(q) || !!ot.nom_prestataire?.toLowerCase().includes(q);
}

function filterDocument(d: DocumentDashboardItem, q: string): boolean {
  return d.nom_original.toLowerCase().includes(q) || d.nom_type.toLowerCase().includes(q);
}

// Constantes layout listes compactes (doivent rester en sync avec CardList compact)
const ROW_BASE = 26;
const ROW_GAP = 2;
const ROW_PAD = 2;
const ROW_MIN = ROW_BASE + ROW_GAP;
const HEADER_H = 28;
const MAX_ROW_H = ROW_BASE * 1.3;

const ONBOARDING_STEPS = [
  { label: "Établissement", path: "/parametres", key: "has_etablissement" as const },
  { label: "Localisations", path: "/localisations", key: "has_localisations" as const },
  { label: "Équipements", path: "/equipements", key: "has_equipements" as const },
  { label: "Prestataires", path: "/prestataires", key: "has_prestataires" as const },
  { label: "Contrats", path: "/contrats", key: "has_contrats" as const },
  { label: "Gammes", path: "/gammes", key: "has_gammes" as const },
  { label: "Premier OT", path: "/ordres-travail", key: "has_ot" as const },
];

// Pas de décalage par ←/→ : 13 semaines (même valeur que la page Planning)
const NAV_STEP_WEEKS = 13;

/// Dashboard — Tableau de bord synthétique
export function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading } = useDashboard();
  const listRef = useRef<HTMLDivElement>(null);
  const [containerH, setContainerH] = useState(0);

  // Décalage temporel partagé entre PlanningChart et ContratsTimeline
  const [weekOffset] = useTemporalNavigation({ step: NAV_STEP_WEEKS, allowReset: true });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      setContainerH((prev) => Math.abs(prev - h) < 2 ? prev : h);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (isLoading || !data) {
    return <div className="p-6"><p className="text-sm text-muted-foreground">Chargement du tableau de bord...</p></div>;
  }

  const showOnboarding = !data.has_ot;
  const diActive = data.nb_di_ouvertes > 0;

  // Nombre max de données entre les deux listes
  const dataCount = Math.max(
    data.dernieres_di.length,
    data.ot_regl_sans_doc.length > 0 ? data.ot_regl_sans_doc.length : data.derniers_documents.length,
  );

  const available = containerH > HEADER_H ? containerH - HEADER_H : 0;
  const fittable = Math.max(1, Math.floor(available / ROW_MIN));
  const maxItems = Math.min(fittable, dataCount);
  const usable = available - 2 * ROW_PAD;
  const rawRowH = maxItems > 0 ? (usable - (maxItems - 1) * ROW_GAP) / maxItems : ROW_BASE;
  const dynamicRowH = Math.floor(Math.min(MAX_ROW_H, Math.max(ROW_BASE, rawRowH)));

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

      {/* Graphiques */}
      <div className="flex gap-3 shrink-0 h-[30vh]">
        <OtDonutChart groups={[
          { label: "En retard", categorie: "en_retard", segments: [{ label: "En retard", value: data.nb_ot_en_retard, color: "hsl(0, 65%, 50%)" }] },
          { label: "Cette semaine", categorie: "cette_semaine", segments: statutsToSegments(data.ot_cette_semaine) },
          { label: "En cours", categorie: "en_cours", segments: [{ label: "En cours", value: data.nb_ot_en_cours, color: "hsl(215, 70%, 52%)" }] },
        ]} />
        <PlanningChart weekOffset={weekOffset} />
        <GammeSunburst />
      </div>

      {/* Timeline contrats */}
      <ContratsTimeline offsetDays={weekOffset * 7} />

      {/* Listes */}
      <div ref={listRef} className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
        <CardList
          data={data.dernieres_di.slice(0, maxItems)}
          getKey={(di) => di.id_di}
          getHref={(di) => `/demandes/${di.id_di}`}
          filterFn={filterDi}
          icon={<AlertCircle className="size-5 text-muted-foreground" />}
          title={diActive ? "Demandes à traiter" : "Dernières demandes résolues"}
          showSearch={false}
          compact
          rowHeight={dynamicRowH}
          emptyTitle={diActive ? "Aucune demande en attente" : "Aucune demande d'intervention"}
          renderContent={(di) => (
            <p className="flex-1 text-[11px] leading-tight truncate">
              {diActive && (
                <span className="mr-1.5 text-muted-foreground tabular-nums">
                  {formatDateShort(di.date_constat)}
                </span>
              )}
              {di.libelle_constat}
            </p>
          )}
          renderRight={(di) => (
            <DiStatusBadge id={di.id_statut_di} className="h-4 text-[10px] px-1.5" />
          )}
        />
        {data.ot_regl_sans_doc.length > 0 ? (
          <CardList
            data={data.ot_regl_sans_doc.slice(0, maxItems)}
            getKey={(ot) => ot.id_ordre_travail}
            getHref={(ot) => `/ordres-travail/${ot.id_ordre_travail}`}
            getImageId={(ot) => ot.id_image}
            filterFn={filterOtDoc}
            icon={<AlertTriangle className="size-5 text-destructive" />}
            title="Documents manquants"
            showSearch={false}
            compact
            rowHeight={dynamicRowH}
            emptyTitle="Aucun document manquant"
            renderContent={(ot) => (
              <p className="flex-1 text-[11px] leading-tight truncate">{ot.nom_gamme}</p>
            )}
            renderRight={(ot) => (
              <OtStatusBadge id={ot.id_statut_ot} className="h-4 text-[10px] px-1.5" />
            )}
          />
        ) : (
          <CardList
            data={data.derniers_documents.slice(0, maxItems)}
            getKey={(d) => d.id_document}
            getHref={(d) => `/documents?doc=${d.id_document}`}
            filterFn={filterDocument}
            icon={<FileText className="size-5 text-muted-foreground" />}
            title="Documents récents"
            showSearch={false}
            compact
            rowHeight={dynamicRowH}
            emptyTitle="Aucun document"
            renderContent={(d) => (
              <p className="flex-1 text-[11px] leading-tight truncate">{stripExtension(d.nom_original)}</p>
            )}
          />
        )}
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
