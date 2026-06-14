# =========================================================================
# backup.ps1 — Sauvegarde complète du projet Supabase Dédale (cloud)
# -------------------------------------------------------------------------
# Tout se passe dans le dossier Dédale (le projet y est déjà lié au cloud).
#
# Produit un dossier horodaté  Dédale\backup\<AAAA-MM-JJ_HHmmss>\  avec :
#   - schema.sql   : structure (tables, RLS, fonctions, triggers, vues)
#   - data.sql     : toutes les données (lignes ajoutées)
#   - roles.sql    : rôles / config liée aux rôles
#   - storage/     : tous les fichiers des buckets Storage
#
# Pré-requis (déjà fait) :
#   npx supabase login
#   npx supabase link --project-ref ybxuojtyevldrbieaykh
#
# Usage :  .\backup.ps1
# =========================================================================

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# --- Vérif du lien projet --------------------------------------------------
if (-not (Test-Path "supabase\.temp\linked-project.json")) {
    Write-Host "Projet non lié au CLI." -ForegroundColor Red
    Write-Host "Lance d'abord :  npx supabase link --project-ref ybxuojtyevldrbieaykh" -ForegroundColor Yellow
    exit 1
}

# --- Dossier de sortie horodaté -------------------------------------------
$stamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$dest  = Join-Path (Join-Path $PSScriptRoot "backup") $stamp
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "==> Backup dans : $dest`n" -ForegroundColor Cyan

# --- 1. Schéma -------------------------------------------------------------
Write-Host "[1/4] Schéma (structure + RLS + fonctions)..." -ForegroundColor Green
npx supabase db dump --linked -f "$dest\schema.sql"

# --- 2. Données ------------------------------------------------------------
Write-Host "[2/4] Données (toutes les lignes)..." -ForegroundColor Green
npx supabase db dump --linked --data-only -f "$dest\data.sql"

# --- 3. Rôles --------------------------------------------------------------
Write-Host "[3/4] Rôles..." -ForegroundColor Green
npx supabase db dump --linked --role-only -f "$dest\roles.sql"

# --- 4. Storage ------------------------------------------------------------
Write-Host "[4/4] Storage (fichiers des buckets)..." -ForegroundColor Green
$storageDir = Join-Path $dest "storage"
New-Item -ItemType Directory -Force -Path $storageDir | Out-Null

# Liste les buckets (premier niveau de ss:///), puis copie chacun récursivement.
# NB : les commandes storage exigent --experimental ; on ne garde que les
# lignes de buckets (terminées par "/"), pour écarter les logs ("Initialising...").
$buckets = npx supabase storage ls "ss:///" --linked --experimental 2>$null |
    Where-Object { $_ -and $_.Trim().EndsWith("/") } |
    ForEach-Object { $_.Trim().TrimEnd("/") }

if (-not $buckets) {
    Write-Host "    Aucun bucket trouvé (ou storage vide)." -ForegroundColor Yellow
} else {
    foreach ($b in $buckets) {
        Write-Host "    - bucket '$b'..." -ForegroundColor DarkGray
        $target = Join-Path $storageDir $b
        New-Item -ItemType Directory -Force -Path $target | Out-Null
        npx supabase storage cp -r "ss:///$b" "$target" --linked --experimental
    }
}

# --- Récap -----------------------------------------------------------------
Write-Host "`n==> Backup terminé." -ForegroundColor Cyan
Get-ChildItem -Recurse $dest | Measure-Object -Property Length -Sum | ForEach-Object {
    $mb = [math]::Round($_.Sum / 1MB, 2)
    Write-Host ("    {0} fichiers, {1} Mo" -f $_.Count, $mb) -ForegroundColor Cyan
}
Write-Host "    -> $dest" -ForegroundColor Cyan
