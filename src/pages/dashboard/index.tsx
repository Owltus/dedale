import { Link, useNavigate } from "react-router-dom";
import { useCallback, useState } from "react";
import { PageHeader } from "@/components/layout";
import { CardList } from "@/components/shared/CardList";
import { useTemporalNavigation } from "@/hooks/useTemporalNavigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertCircle, AlertTriangle, CheckCircle, FileText, Wrench } from "lucide-react";
import { OtDonutChart } from "./OtDonutChart";
import { statutsToSegments } from "./donut-segments";
import { OT_PRIORITY_FILL } from "@/lib/utils/colors";
import { GammeSunburst } from "./GammeSunburst";
import { PlanningChart } from "./PlanningChart";
import { ContratsTimeline } from "./ContratsTimeline";
import { useDashboard } from "@/hooks/use-dashboard";
import { DiStatusBadge, OtStatusBadge } from "@/components/shared/StatusBadge";
import { DocumentPreviewDialog } from "@/components/shared/DocumentPreviewDialog";
import { OtGammeCell } from "@/components/shared/OtGammeCell";
import { useDocumentPreview, useSaveDocumentToDisk } from "@/hooks/use-documents";
import { getEffectiveOtStatutId } from "@/lib/utils/statuts";
import { formatDateWithWeek } from "@/lib/utils/format";
import type { DiDashboardItem, DocumentDashboardItem, OtDashboardItem } from "@/lib/types/dashboard";

function filterDi(di: DiDashboardItem, q: string): boolean {
  return di.libelle_constat.toLowerCase().includes(q);
}

function filterDocument(d: DocumentDashboardItem, q: string): boolean {
  return d.nom_original.toLowerCase().includes(q) || d.nom_type.toLowerCase().includes(q);
}

function filterOtSansDoc(ot: OtDashboardItem, q: string): boolean {
  return ot.nom_gamme.toLowerCase().includes(q) || !!ot.nom_prestataire?.toLowerCase().includes(q);
}

// Constantes layout listes compactes (doivent rester en sync avec CardList compact)
const ROW_BASE = 26;
const ROW_GAP = 2;
const ROW_PAD = 2;
const HEADER_H = 28;     // h-7 du header en mode compact
const CARD_BORDER = 2;   // bordure haut+bas du conteneur `rounded-md border`
const MAX_ROW_H = ROW_BASE * 1.3;

const ONBOARDING_STEPS = [
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
  const { data, isLoading } = useDashboard();
  const [containerH, setContainerH] = useState(0);

  // Décalage temporel partagé entre PlanningChart et ContratsTimeline
  const [weekOffset] = useTemporalNavigation({ step: NAV_STEP_WEEKS, allowReset: true });

  const { previewDoc, previewData, openPreview, closePreview } = useDocumentPreview();
  const saveToDisk = useSaveDocumentToDisk();

  const navigate = useNavigate();
  const [otSansDocOpen, setOtSansDocOpen] = useState(false);

  // Ref callback (et non useEffect) car le conteneur n'est monté qu'après l'early-return de chargement.
  const listRef = useCallback((el: HTMLDivElement | null) => {
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

  const otSansDocCount = data.ot_regl_sans_doc.length;
  const leftCount = data.dernieres_di.length;
  const rightCount = data.derniers_documents.length;

  const scrollH = Math.max(0, containerH - HEADER_H - CARD_BORDER);

  // Capacité max d'items à hauteur ROW_BASE :
  //   N * ROW_BASE + (N - 1) * ROW_GAP + 2 * ROW_PAD <= scrollH
  //   ⇒ N <= (scrollH + ROW_GAP - 2 * ROW_PAD) / (ROW_BASE + ROW_GAP)
  const fittable = Math.max(1, Math.floor((scrollH + ROW_GAP - 2 * ROW_PAD) / (ROW_BASE + ROW_GAP)));
  const diMaxItems = Math.min(fittable, leftCount);
  const rightMaxItems = Math.min(fittable, rightCount);

  // Hauteur de ligne partagée : calée sur la liste qui remplit le plus la carte,
  // pour rester visuellement homogène entre les deux colonnes.
  const rowsForHeight = Math.max(1, Math.min(fittable, Math.max(leftCount, rightCount)));
  const usable = scrollH - 2 * ROW_PAD;
  const rawRowH = (usable - (rowsForHeight - 1) * ROW_GAP) / rowsForHeight;
  const dynamicRowH = Math.floor(Math.min(MAX_ROW_H, Math.max(ROW_BASE, rawRowH)));

  return (
    <div className="flex flex-1 flex-col p-6 gap-4 overflow-hidden">
      <PageHeader title="Tableau de bord" />

      {/* Graphiques */}
      <div className="flex gap-3 shrink-0 h-[30vh]">
        <OtDonutChart groups={[
          { label: "En retard", categorie: "en_retard", segments: [{ label: "En retard", value: data.nb_ot_en_retard, color: OT_PRIORITY_FILL[1]! }] },
          { label: "Cette semaine", categorie: "cette_semaine", segments: statutsToSegments(data.ot_cette_semaine) },
          { label: "En cours", categorie: "en_cours", segments: [{ label: "En cours", value: data.nb_ot_en_cours, color: OT_PRIORITY_FILL[3]! }] },
        ]} />
        <PlanningChart weekOffset={weekOffset} />
        <GammeSunburst />
      </div>

      {/* Timeline contrats */}
      <ContratsTimeline offsetDays={weekOffset * 7} />

      {/* Listes */}
      <div ref={listRef} className="flex-1 grid grid-cols-2 gap-4 min-h-0 overflow-hidden">
        <CardList
          data={data.dernieres_di.slice(0, diMaxItems)}
          getKey={(di) => di.id_di}
          getHref={(di) => `/demandes/${di.id_di}`}
          filterFn={filterDi}
          icon={<AlertCircle className="size-5 text-muted-foreground" />}
          title="Demandes d'intervention"
          showSearch={false}
          compact
          rowHeight={dynamicRowH}
          emptyTitle="Aucune demande d'intervention"
          renderContent={(di) => (
            <p className="flex-1 text-[11px] leading-tight truncate">{di.libelle_constat}</p>
          )}
          renderRight={(di) => (
            <DiStatusBadge id={di.id_statut_di} className="h-4 text-[10px] px-1.5" />
          )}
        />
        <CardList
          data={data.derniers_documents.slice(0, rightMaxItems)}
          getKey={(d) => d.id_document}
          onItemClick={openPreview}
          filterFn={filterDocument}
          icon={<FileText className="size-5 text-muted-foreground" />}
          title="Documents"
          showSearch={false}
          compact
          rowHeight={dynamicRowH}
          emptyTitle="Aucun document"
          extraToolbar={otSansDocCount > 0 ? (
            <button
              type="button"
              onClick={() => setOtSansDocOpen(true)}
              title={`${otSansDocCount} OT réglementaire${otSansDocCount > 1 ? "s" : ""} sans document`}
              className="flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-1.5 h-5 text-[10px] font-medium text-destructive hover:bg-destructive/20 transition-colors"
            >
              <AlertTriangle className="size-3" />
              <span className="tabular-nums">{otSansDocCount}</span>
            </button>
          ) : undefined}
          renderContent={(d) => (
            <p className="flex-1 text-[11px] leading-tight truncate">{d.nom_original}</p>
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

      <DocumentPreviewDialog
        doc={previewDoc}
        previewData={previewData}
        onClose={closePreview}
        onDownload={saveToDisk}
      />

      <Dialog open={otSansDocOpen} onOpenChange={setOtSansDocOpen}>
        <DialogContent className="!max-w-2xl !w-[90vw] h-[80vh] flex flex-col !p-0 !gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              OT réglementaires sans document
            </DialogTitle>
          </DialogHeader>
          <CardList
            className="mx-4 mb-4"
            data={data.ot_regl_sans_doc}
            getKey={(ot) => ot.id_ordre_travail}
            getImageId={(ot) => ot.id_image}
            onItemClick={(ot) => {
              setOtSansDocOpen(false);
              navigate(`/ordres-travail/${ot.id_ordre_travail}`);
            }}
            filterFn={filterOtSansDoc}
            icon={<Wrench className="size-5 text-muted-foreground" />}
            showTitle={false}
            showSearch={false}
            emptyTitle="Aucun OT sans document"
            renderContent={(ot) => (
              <div className="flex-1 min-w-0">
                <OtGammeCell nomGamme={ot.nom_gamme} />
                <p className="text-xs text-muted-foreground truncate">{ot.nom_prestataire ?? " "}</p>
              </div>
            )}
            renderRight={(ot) => (
              <div className="flex flex-col items-center gap-1 w-32 shrink-0">
                <OtStatusBadge id={getEffectiveOtStatutId(ot)} />
                <span className="text-xs text-muted-foreground">{formatDateWithWeek(ot.date_prevue)}</span>
              </div>
            )}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
