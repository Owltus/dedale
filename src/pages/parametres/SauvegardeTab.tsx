import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Database, Download, FolderOpen, History, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useBackupSession } from "@/hooks/use-backup-session";
import {
  useBackupInspect,
  useBackupRestore,
  useLocalBackups,
  useOpenAppDataDir,
} from "@/hooks/use-backup";
import { cn } from "@/lib/utils";
import { formatBytes, formatDateTime } from "@/lib/utils/format";
import type { BackupManifest, BackupProgress, LocalBackup } from "@/lib/types/backup";

interface RestoreCandidate {
  zipPath: string;
  manifest: BackupManifest;
}

export function SauvegardeTab() {
  const session = useBackupSession();
  const inspectMutation = useBackupInspect();
  const restoreMutation = useBackupRestore();
  const openDirMutation = useOpenAppDataDir();
  const { data: localBackups = [] } = useLocalBackups();

  const [candidate, setCandidate] = useState<RestoreCandidate | null>(null);

  const handleCreate = async () => {
    // Si une session est déjà en cours, on ne relance pas — l'utilisateur voit
    // déjà la barre, le bouton est désactivé. Garde-fou en cas de double clic rapide.
    if (session.isPending) return;
    try {
      // Le toast et l'invalidation des queries sont gérés dans le provider.
      // Ce composant peut être démonté entre-temps : la session continue.
      await session.start();
    } catch {
      // Erreur déjà reportée par le provider (toast). Pas de re-emission ici.
    }
  };

  const handlePickRestore = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Archive DÉDALE", extensions: ["zip"] }],
        title: "Choisir une sauvegarde à restaurer",
      });
      if (!selected) return;
      const manifest = await inspectMutation.mutateAsync({ zipPath: selected });
      setCandidate({ zipPath: selected, manifest });
    } catch (err) {
      toast.error(`Impossible de lire l'archive : ${String(err)}`);
    }
  };

  const handlePickLocal = (b: LocalBackup) => {
    if (!b.manifest) {
      toast.error("Cette sauvegarde locale est illisible et ne peut pas être restaurée.");
      return;
    }
    setCandidate({ zipPath: b.zip_path, manifest: b.manifest });
  };

  const handleConfirmRestore = async () => {
    if (!candidate) return;
    try {
      await restoreMutation.mutateAsync({ zipPath: candidate.zipPath });
    } catch (err) {
      toast.error(`Restauration échouée : ${String(err)}`);
      setCandidate(null);
    }
  };

  const handleOpenDir = async () => {
    try {
      await openDirMutation.mutateAsync({});
    } catch (err) {
      toast.error(`Ouverture du dossier échouée : ${String(err)}`);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-min">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="size-4" />
            Créer une sauvegarde
          </CardTitle>
          <CardDescription>
            Génère une archive <code>.zip</code> contenant un instantané de la base de données et de tous les documents liés (PDF, images). La sauvegarde est conservée localement — seules les 3 plus récentes sont gardées, la plus ancienne est supprimée à chaque nouvelle création.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <Button onClick={handleCreate} disabled={session.isPending}>
            <Database className="size-4" />
            {session.isPending ? "Sauvegarde en cours..." : "Créer une sauvegarde"}
          </Button>
          {session.isPending && session.progress && (
            <ProgressLine progress={session.progress} className="w-full" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-4" />
            Restaurer depuis une archive
          </CardTitle>
          <CardDescription>
            Remplace intégralement la base et les documents actuels par le contenu d'une archive <code>.zip</code> externe (disque, cloud…). L'application redémarre une fois la restauration terminée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={handlePickRestore}
            disabled={inspectMutation.isPending || restoreMutation.isPending}
          >
            <Upload className="size-4" />
            {inspectMutation.isPending ? "Lecture..." : "Restaurer depuis une archive..."}
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" />
            Sauvegardes locales
          </CardTitle>
          <CardDescription>
            Les 3 sauvegardes les plus récentes sont conservées dans le dossier des données. À chaque nouvelle sauvegarde, la plus ancienne est supprimée.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {localBackups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune sauvegarde locale pour l'instant — cliquez sur « Créer une sauvegarde » pour commencer.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {localBackups.map((b) => (
                <LocalBackupItem
                  key={b.stamp}
                  backup={b}
                  onRestore={() => handlePickLocal(b)}
                  isRestoring={restoreMutation.isPending}
                />
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" onClick={handleOpenDir} className="self-start">
            <FolderOpen className="size-4" />
            Ouvrir le dossier des données
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={candidate !== null}
        onOpenChange={(o) => !o && setCandidate(null)}
        title="Restaurer cette sauvegarde ?"
        description="Cette opération remplace toutes les données actuelles. L'application redémarrera ensuite."
        confirmLabel="Restaurer et redémarrer"
        cancelLabel="Annuler"
        variant="destructive"
        onConfirm={handleConfirmRestore}
        isLoading={restoreMutation.isPending}
      >
        {candidate && <ManifestSummary manifest={candidate.manifest} />}
      </ConfirmDialog>
    </div>
  );
}

interface LocalBackupItemProps {
  backup: LocalBackup;
  onRestore: () => void;
  isRestoring: boolean;
}

function LocalBackupItem({ backup, onRestore, isRestoring }: LocalBackupItemProps) {
  const m = backup.manifest;
  const dateLabel = m ? formatDateTime(m.created_at) : backup.stamp;
  const detail = m
    ? `${formatBytes(backup.size_bytes)} — ${m.documents_count.toLocaleString("fr-FR")} document${m.documents_count > 1 ? "s" : ""}`
    : `${formatBytes(backup.size_bytes)} — manifest illisible`;

  return (
    <li className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-col min-w-0">
        <span className="font-medium truncate">{dateLabel}</span>
        <span className="text-xs text-muted-foreground truncate">{detail}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onRestore}
        disabled={isRestoring || !m}
        className="shrink-0"
      >
        Restaurer
      </Button>
    </li>
  );
}

const PHASE_LABELS: Record<BackupProgress["phase"], string> = {
  snapshot: "Snapshot de la base",
  documents: "Compression des documents",
  finalizing: "Finalisation de l'archive",
  done: "Terminé",
  idle: "",
};

/// Pondération des phases dans la barre globale (0-100). Le snapshot SQLite
/// occupe la moitié de la barre car c'est le plus long sur petites bases ;
/// les documents prennent le gros sur grosses bases. Finalizing est court.
const PHASE_RANGES: Record<BackupProgress["phase"], { start: number; end: number }> = {
  snapshot: { start: 0, end: 50 },
  documents: { start: 50, end: 95 },
  finalizing: { start: 95, end: 100 },
  done: { start: 100, end: 100 },
  idle: { start: 0, end: 0 },
};

interface ProgressLineProps {
  progress: BackupProgress;
  className?: string;
}

/// Barre de progression globale qui avance de 0 à 100% sur l'ensemble du backup.
/// Les phases sont pondérées (snapshot 0-50%, documents 50-95%, finalizing 95-100%)
/// — la barre ne se réinitialise jamais entre phases, juste son rythme change.
function ProgressLine({ progress, className }: ProgressLineProps) {
  const value = computeGlobalProgress(progress);
  const detail =
    (progress.phase === "documents" || progress.phase === "snapshot") && progress.total > 0
      ? ` (${progress.current} / ${progress.total})`
      : "";
  const label = `${PHASE_LABELS[progress.phase]}${detail}`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">{value}%</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

/// Convertit la progression d'une phase en pourcentage global (0-100). Chaque
/// phase occupe une plage fixe de la barre — sa progression interne se mappe
/// linéairement sur cette plage. Une phase sans total connu est positionnée
/// au début de sa plage.
function computeGlobalProgress(progress: BackupProgress): number {
  if (progress.phase === "done") return 100;
  if (progress.phase === "idle") return 0;

  const range = PHASE_RANGES[progress.phase];
  const span = range.end - range.start;
  if (progress.total > 0) {
    const ratio = Math.min(1, progress.current / progress.total);
    return Math.round(range.start + span * ratio);
  }
  return range.start;
}

interface ManifestSummaryProps {
  manifest: BackupManifest;
}

/// Résumé identifiant d'une archive — affiché dans la dialog de confirmation
function ManifestSummary({ manifest }: ManifestSummaryProps) {
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
      <dt className="text-muted-foreground">Date</dt>
      <dd>{formatDateTime(manifest.created_at)}</dd>

      <dt className="text-muted-foreground">Version d'app</dt>
      <dd>
        {manifest.app_version}{" "}
        <span className="text-xs text-muted-foreground">(schéma v{manifest.schema_version})</span>
      </dd>

      <dt className="text-muted-foreground">Base de données</dt>
      <dd>{formatBytes(manifest.db_size_bytes)}</dd>

      <dt className="text-muted-foreground">Contenu</dt>
      <dd>
        {manifest.ot_count.toLocaleString("fr-FR")} OT, {manifest.gammes_count.toLocaleString("fr-FR")} gammes,{" "}
        {manifest.equipements_count.toLocaleString("fr-FR")} équipements,{" "}
        {manifest.documents_count.toLocaleString("fr-FR")} document{manifest.documents_count > 1 ? "s" : ""}
      </dd>
    </dl>
  );
}
