import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Cpu, FileText, FileWarning, Link2, ListChecks, MapPin, User, Wrench, type LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useDocumentLiaisons } from "@/hooks/use-documents";
import type { DocumentEntityType, DocumentLiaison } from "@/lib/types/documents";
import { CardList } from "./CardList";

interface DocumentLiaisonsButtonProps {
  idDocument: number;
  nbLiaisons: number;
}

function filterLiaison(l: DocumentLiaison, q: string): boolean {
  return l.label.toLowerCase().includes(q) || (l.sublabel?.toLowerCase().includes(q) ?? false);
}

interface EntityMeta {
  icon: LucideIcon;
  label: string;
  href: (l: DocumentLiaison) => string;
}

const ENTITY_META: Record<DocumentEntityType, EntityMeta> = {
  ordres_travail: { icon: Wrench,      label: "Ordre de travail", href: (l) => `/ordres-travail/${l.entity_id}` },
  equipements:    { icon: Cpu,         label: "Équipement",       href: (l) => `/equipements/${l.entity_id}` },
  gammes:         { icon: ListChecks,  label: "Gamme",            href: (l) => `/gammes/${l.entity_id}` },
  prestataires:   { icon: Building2,   label: "Prestataire",      href: (l) => `/prestataires/${l.entity_id}` },
  contrats:       { icon: FileText,    label: "Contrat",          href: (l) => `/prestataires/${l.parent_id}` },
  di:             { icon: FileWarning, label: "Demande",          href: (l) => `/demandes/${l.entity_id}` },
  localisations:  { icon: MapPin,      label: "Local",            href: (l) => `/localisations/locaux/${l.entity_id}` },
  techniciens:    { icon: User,        label: "Technicien",       href: (l) => `/techniciens/${l.entity_id}` },
};

/// Badge dot cliquable affichant le compteur de liaisons d'un document.
/// Au clic : si 1 liaison → navigation directe, si N → Dialog avec liste cliquable.
/// Lazy fetch : la liste des liaisons n'est chargée qu'au premier clic.
export function DocumentLiaisonsButton({ idDocument, nbLiaisons }: DocumentLiaisonsButtonProps) {
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [pendingAction, setPendingAction] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: liaisons = [], isFetching } = useDocumentLiaisons(idDocument, { enabled });

  useEffect(() => {
    if (!pendingAction || !enabled || isFetching) return;
    setPendingAction(false);
    if (liaisons.length === 1) {
      const l = liaisons[0]!;
      navigate(ENTITY_META[l.entity_type].href(l));
    } else if (liaisons.length > 1) {
      setPickerOpen(true);
    }
  }, [pendingAction, enabled, isFetching, liaisons, navigate]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setEnabled(true);
    setPendingAction(true);
  };

  const handlePickLiaison = (l: DocumentLiaison) => {
    setPickerOpen(false);
    navigate(ENTITY_META[l.entity_type].href(l));
  };

  // Wrapper display:contents qui stoppe les clics bubblant depuis ce composant.
  // Les Dialog sont portalisés en DOM mais restent enfants dans le React tree :
  // sans ce stop, leurs clics remontent jusqu'à la card du document et déclenchent
  // l'ouverture de la preview.
  return (
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleClick}
        title={nbLiaisons === 1 ? "Voir l'entité liée" : `Voir les ${nbLiaisons} entités liées`}
        className="rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <Badge variant="secondary" className="h-4 gap-0.5 px-1 py-0 text-[10px] font-medium shadow-sm cursor-pointer hover:bg-secondary/80 transition-colors">
          <Link2 className="size-2.5" />
          {nbLiaisons}
        </Badge>
      </button>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle>Entités liées au document</DialogTitle>
            <DialogDescription>
              {liaisons.length} liaison{liaisons.length > 1 ? "s" : ""} — cliquez pour ouvrir
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden px-3 pb-3">
            <CardList
              data={liaisons}
              getKey={(l) => `${l.entity_type}-${l.entity_id}`}
              onItemClick={handlePickLiaison}
              filterFn={filterLiaison}
              icon={<Link2 className="size-5 text-muted-foreground" />}
              getIcon={(l) => {
                const Icon = ENTITY_META[l.entity_type].icon;
                return <Icon className="size-5 text-muted-foreground" />;
              }}
              showTitle={false}
              showSearch={false}
              renderContent={(l) => (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{l.label}</p>
                  {l.sublabel && (
                    <p className="text-xs text-muted-foreground truncate">{l.sublabel}</p>
                  )}
                </div>
              )}
              renderRight={(l) => (
                <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[10px] font-normal text-muted-foreground">
                  {ENTITY_META[l.entity_type].label}
                </Badge>
              )}
            />
          </div>
        </DialogContent>
      </Dialog>
    </span>
  );
}
