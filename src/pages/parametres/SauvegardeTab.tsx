import { useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Database, Download, FolderOpen, History, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useBackupSession } from "@/hooks/use-backup-session";
import {
  useBackupInspect,
  useBackupRestore,
  useDerniereSauvegarde,
  useOpenAppDataDir,
  usePreRestoreBackups,
  useRestorePreRestore,
} from "@/hooks/use-backup";
import { cn } from "@/lib/utils";
import { daysSince, formatBytes, formatDateTime } from "@/lib/utils/format";
import type { BackupManifest, BackupProgress, LocalPreRestoreBackup } from "@/lib/types/backup";

/// Nom de fichier suggéré : dedale-backup-2026-04-26-1432.zip
function defaultBackupName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `dedale-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.zip`;
}

interface RestoreCandidate {
  zipPath: string;
  manifest: BackupManifest;
}

export function SauvegardeTab() {
  const session = useBackupSession();
  const inspectMutation = useBackupInspect();
  const restoreMutation = useBackupRestore();
  const restorePreRestoreMutation = useRestorePreRestore();
  const openDirMutation = useOpenAppDataDir();
  const { data: derniereSauvegarde } = useDerniereSauvegarde();
  const { data: preRestoreBackups = [] } = usePreRestoreBackups();

  const [candidate, setCandidate] = useState<RestoreCandidate | null>(null);
  const [preRestoreCandidate, setPreRestoreCandidate] = useState<LocalPreRestoreBackup | null>(null);

  const handleCreate = async () => {
    // Si une session est déjà en cours, on ne relance pas — l'utilisateur voit
    // déjà la barre, le bouton est désactivé. Garde-fou en cas de double clic rapide.
    if (session.isPending) return;
    try {
      const destination = await save({
        defaultPath: defaultBackupName(),
        filters: [{ name: "Archive DÉDALE", extensions: ["zip"] }],
        title: "Enregistrer la sauvegarde",
      });
      if (!destination) return;
      // Le toast et l'invalidation des queries sont gérés dans le provider.
      // Ce composant peut être démonté entre-temps : la session continue.
      await session.start(destination);
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

  const handleConfirmRestore = async () => {
    if (!candidate) return;
    try {
      await restoreMutation.mutateAsync({ zipPath: candidate.zipPath });
    } catch (err) {
      toast.error(`Restauration échouée : ${String(err)}`);
      setCandidate(null);
    }
  };

  const handleConfirmRestorePreRestore = async () => {
    if (!preRestoreCandidate) return;
    try {
      await restorePreRestoreMutation.mutateAsync({ stamp: preRestoreCandidate.stamp });
    } catch (err) {
      toast.error(`Restauration échouée : ${String(err)}`);
      setPreRestoreCandidate(null);
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
            Génère une archive <code>.zip</code> contenant un instantané de la base de données et de tous les documents liés (PDF, images). À conserver sur un disque externe ou dans le cloud.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <FreshnessLine derniereSauvegarde={derniereSauvegarde ?? null} />
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
            Remplace intégralement la base et les documents actuels par le contenu d'une archive <code>.zip</code>. Un filet de sécurité (copie de la base actuelle) est créé automatiquement avant l'écrasement. L'application redémarre une fois la restauration terminée.
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
            Sauvegardes locales automatiques
          </CardTitle>
          <CardDescription>
            Avant chaque restauration, l'application met de côté une copie de la base et des documents en cours. Les {preRestoreBackups.length > 0 ? "trois" : ""} plus récentes sont conservées comme filet de sécurité.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {preRestoreBackups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune sauvegarde automatique pour l'instant — elles apparaîtront après votre première restauration.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {preRestoreBackups.map((b) => (
                <li
                  key={b.stamp}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{b.created_at}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {formatBytes(b.db_size_bytes)}
                      {b.has_documents ? " — avec documents" : " — sans documents"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreRestoreCandidate(b)}
                    disabled={restorePreRestoreMutation.isPending}
                    className="shrink-0"
                  >
                    Restaurer
                  </Button>
                </li>
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
        description="Cette opération remplace toutes les données actuelles. Une copie de sécurité est créée automatiquement avant l'écrasement. L'application redémarrera ensuite."
        confirmLabel="Restaurer et redémarrer"
        cancelLabel="Annuler"
        variant="destructive"
        onConfirm={handleConfirmRestore}
        isLoading={restoreMutation.isPending}
      >
        {candidate && <ManifestSummary manifest={candidate.manifest} />}
      </ConfirmDialog>

      <ConfirmDialog
        open={preRestoreCandidate !== null}
        onOpenChange={(o) => !o && setPreRestoreCandidate(null)}
        title="Restaurer ce filet de sécurité ?"
        description={
          preRestoreCandidate
            ? `Sauvegarde automatique du ${preRestoreCandidate.created_at}. L'application redémarrera ensuite.`
            : ""
        }
        confirmLabel="Restaurer et redémarrer"
        cancelLabel="Annuler"
        variant="destructive"
        onConfirm={handleConfirmRestorePreRestore}
        isLoading={restorePreRestoreMutation.isPending}
      />
    </div>
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

interface FreshnessLineProps {
  derniereSauvegarde: string | null;
}

function freshnessVariant(days: number): "default" | "secondary" | "destructive" {
  if (days < 7) return "default";
  if (days < 30) return "secondary";
  return "destructive";
}

function freshnessLabel(days: number): string {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "il y a 1 jour";
  return `il y a ${days} jours`;
}

function FreshnessLine({ derniereSauvegarde }: FreshnessLineProps) {
  const days = daysSince(derniereSauvegarde);

  if (derniereSauvegarde === null || days === null) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Dernière sauvegarde :</span>
        <Badge variant="destructive">jamais</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Dernière sauvegarde :</span>
      <Badge variant={freshnessVariant(days)}>{freshnessLabel(days)}</Badge>
      <span className="text-xs text-muted-foreground">({formatDateTime(derniereSauvegarde)})</span>
    </div>
  );
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
