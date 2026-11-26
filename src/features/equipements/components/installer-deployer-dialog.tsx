import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Info, MapPinned } from 'lucide-react'
import { useCreateParcSousCategorie } from '../mutations'
import { flottesDeployables, type FlotteDeployable } from '../deploiement'
import { DeploiementDialog } from './deploiement-dialog'
import {
  categoriesQueries,
  type Categorie,
} from '@/features/categories/queries'
import {
  modelesEquipementsQueries,
  type ModeleEquipement,
} from '@/features/modeles-equipements/queries'
import { useInstallerModeleEquipement } from '@/features/modeles-equipements/mutations'
import {
  installerDeployerSchema,
  type InstallerDeployerValues,
} from '@/features/modeles-equipements/schemas'
import { useSiteContext } from '@/features/sites/site-context'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useEntityDialog } from '@/hooks/use-entity-dialog'
import { parseChamps, prepareChamps, serializeChamps } from '@/lib/champs'
import { writeErrorMessage } from '@/lib/erreurs'
import * as perm from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { InfoNote } from '@/components/common/info-note'
import { RadioField } from '@/components/common/fields/radio-field'
import { SelectField } from '@/components/common/fields/select-field'
import { TextField } from '@/components/common/fields/text-field'

/** Comparaison de noms insensible à la casse et aux espaces de bord. */
const memeNom = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Bouton « Installer et déployer » du détail d'un modèle d'équipement
 * (Bibliothèque), avec ses deux modales : le choix de la flotte, puis
 * l'assistant de déploiement existant ouvert sur cette flotte.
 *
 * Visible seulement si la personne peut déployer (`canDeployerEquipements`),
 * qu'un site est actif et que le modèle est du commun ou de CE site. Trois cas,
 * un seul formulaire :
 * - modèle du commun pas encore sur le site → « Créer une flotte » l'installe
 *   ET crée la flotte en une transaction (`installer_modele_equipement`) ;
 * - modèle du site, ou commun déjà installé (homonyme sur le site) → « Créer
 *   une flotte » recopie le modèle DU SITE dans une nouvelle flotte, sans
 *   lien (comme « Partir d'un modèle ») ;
 * - dans tous les cas, « Utiliser une flotte existante » reprend une flotte du
 *   site (présélectionnée si l'une porte le nom du modèle) sans rien écrire.
 *
 * Injecté par `BibliothequeEcran` dans le panneau des modèles (la feature
 * `modeles-equipements` ne peut pas importer l'assistant : cycle).
 */
export function InstallerDeployer({ modele }: { modele: ModeleEquipement }) {
  const { data: role } = useCurrentRole()
  const { activeSiteId, activeSite } = useSiteContext()
  const choix = useEntityDialog<ModeleEquipement>()
  const [deploiement, setDeploiement] = useState<{
    open: boolean
    categorieId: string | null
  }>({ open: false, categorieId: null })

  // Garde STABLE (rôle + site actif) : l'assistant et son annulation (toast)
  // ne dépendent pas du modèle ouvert.
  if (!perm.canDeployerEquipements(role) || activeSiteId === null) return null
  const surCeSite = modele.site_id === null || modele.site_id === activeSiteId

  return (
    <>
      {surCeSite && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => choix.openEdit(modele)}>
            <MapPinned />
            {modele.site_id === null
              ? 'Installer et déployer'
              : 'Déployer dans des lieux'}
          </Button>
        </div>
      )}
      {choix.entity !== null && (
        <InstallerDeployerDialog
          key={choix.dialogKey}
          open={choix.open}
          onOpenChange={choix.onOpenChange}
          modele={choix.entity}
          siteId={activeSiteId}
          siteNom={activeSite?.nom ?? 'ce site'}
          onFlottePrete={(categorieId) => {
            choix.close()
            setDeploiement({ open: true, categorieId })
          }}
        />
      )}
      <DeploiementDialog
        open={deploiement.open}
        onOpenChange={(open) => setDeploiement((d) => ({ ...d, open }))}
        siteId={activeSiteId}
        categorieIdParDefaut={deploiement.categorieId}
      />
    </>
  )
}

/** Catégories de parc RACINES actives du site : là où se range une flotte. */
function racinesParc(categories: readonly Categorie[], siteId: string) {
  return categories
    .filter(
      (c) =>
        c.scope === 'parc' &&
        c.site_id === siteId &&
        c.parent_id === null &&
        c.est_actif,
    )
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
}

/** Flotte du site qui porte déjà ce modèle (même nom, ou liée à sa copie). */
function flotteDuModele(
  flottes: readonly FlotteDeployable[],
  nom: string,
  copieId: string | null,
): FlotteDeployable | undefined {
  return flottes.find(
    (f) => memeNom(f.nom, nom) || (copieId !== null && f.modeleId === copieId),
  )
}

function InstallerDeployerDialog({
  open,
  onOpenChange,
  modele,
  siteId,
  siteNom,
  onFlottePrete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  modele: ModeleEquipement
  siteId: string
  siteNom: string
  /** Flotte créée ou choisie : l'hôte ouvre l'assistant dessus. */
  onFlottePrete: (categorieId: string) => void
}) {
  const { data: categories = [] } = useQuery(categoriesQueries.pool())
  const { data: modeles = [] } = useQuery(modelesEquipementsQueries.pool())
  const installer = useInstallerModeleEquipement()
  const creerFlotte = useCreateParcSousCategorie()

  // Modèle dont la flotte recopiera le gabarit : le modèle lui-même s'il est
  // du site ; pour un modèle du commun, sa copie déjà installée sur le site
  // (la base refuse de l'installer deux fois), sinon rien → installation.
  const copieSurSite =
    modele.site_id === siteId
      ? modele
      : (modeles.find(
          (m) => m.site_id === siteId && memeNom(m.nom, modele.nom),
        ) ?? null)
  const aInstaller = copieSurSite === null
  const source = copieSurSite ?? modele
  const champs = parseChamps(source.specifications)

  const racines = racinesParc(categories, siteId)
  const flottes = flottesDeployables(categories, siteId)
  const homonyme = flotteDuModele(flottes, modele.nom, copieSurSite?.id ?? null)

  const form = useForm<InstallerDeployerValues>({
    resolver: zodResolver(installerDeployerSchema),
    defaultValues: {
      mode: homonyme ? 'existante' : 'creer',
      parentId: racines.length === 1 ? (racines[0]?.id ?? '') : '',
      nomFlotte: modele.nom,
      valeurPrincipale: '',
      flotteId: homonyme?.id ?? '',
    },
  })
  const mode = useWatch({ control: form.control, name: 'mode' })
  const pending = form.formState.isSubmitting

  /** Crée la flotte (installation comprise si besoin) ; renvoie son id. */
  async function creer(v: InstallerDeployerValues): Promise<string | null> {
    const nom = v.nomFlotte.trim()
    // Refus anticipé d'un homonyme sous la même catégorie (la base refuse aussi).
    if (
      categories.some(
        (c) =>
          c.parent_id === v.parentId &&
          c.site_id === siteId &&
          memeNom(c.nom, nom),
      )
    ) {
      form.setError('nomFlotte', {
        message:
          'Une flotte de ce nom existe déjà sous cette catégorie : choisis un autre nom ou utilise-la.',
      })
      return null
    }
    if (aInstaller) {
      const r = await installer.mutateAsync({
        modeleCommunId: modele.id,
        siteId,
        creerFlotte: true,
        parentId: v.parentId,
        nomFlotte: nom,
        valeurPrincipale: v.valeurPrincipale || null,
      })
      return r.categorieId
    }
    const prepared = prepareChamps(champs)
    if (!prepared.ok) throw new Error(prepared.error)
    const cree = await creerFlotte.mutateAsync({
      nom,
      parentId: v.parentId,
      siteId,
      description: source.description ?? '',
      miniatureId: source.miniature_id,
      modeleId: null,
      specifications: serializeChamps(prepared.champs),
      valeurPrincipale: v.valeurPrincipale || null,
    })
    return cree.id
  }

  async function soumettre(v: InstallerDeployerValues) {
    if (v.mode === 'existante') {
      onFlottePrete(v.flotteId)
      return
    }
    try {
      const id = await creer(v)
      if (id === null) return
      toast.success(
        aInstaller
          ? `« ${modele.nom} » installé sur ${siteNom}, flotte créée`
          : 'Flotte créée',
      )
      onFlottePrete(id)
    } catch (e) {
      toast.error(
        writeErrorMessage(e, {
          '42501': `Action refusée : ton rôle ou tes sites ne permettent pas d’installer ce modèle sur ${siteNom}.`,
          '23505':
            'Une flotte ou un modèle de ce nom existe déjà sur le site : choisis un autre nom ou utilise l’existant.',
        }),
      )
    }
  }

  const sansRacine = mode === 'creer' && racines.length === 0

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={aInstaller ? 'Installer et déployer' : 'Déployer le modèle'}
        description={`Choisis la flotte de « ${modele.nom} » sur ${siteNom}, puis les lieux où la déployer.`}
        onSubmit={() => void form.handleSubmit(soumettre)()}
        submitLabel={
          mode === 'existante'
            ? 'Continuer'
            : aInstaller
              ? 'Installer et continuer'
              : 'Créer et continuer'
        }
        pendingLabel="Enregistrement…"
        pending={pending}
        submitDisabled={sansRacine}
      >
        {flottes.length > 0 && (
          <RadioField
            control={form.control}
            name="mode"
            label="Flotte"
            options={[
              {
                value: 'creer',
                label: 'Créer une flotte',
                description: aInstaller
                  ? `Le modèle est copié sur ${siteNom}, puis une flotte le recopie.`
                  : 'Une nouvelle flotte recopie le modèle du site, sans lien.',
              },
              {
                value: 'existante',
                label: 'Utiliser une flotte existante',
                description: 'Rien n’est créé : on déploie dans cette flotte.',
              },
            ]}
          />
        )}

        {mode === 'existante' ? (
          <SelectField
            control={form.control}
            name="flotteId"
            label="Flotte du site"
            required
            placeholder="— Choisir une flotte —"
            options={flottes.map((f) => ({
              value: f.id,
              label: `${f.categorie} › ${f.nom}`,
            }))}
          />
        ) : (
          <>
            {!aInstaller && modele.site_id === null && (
              <InfoNote icon={Info}>
                « {modele.nom} » est déjà installé sur {siteNom} : la flotte
                recopiera cette copie du site.
              </InfoNote>
            )}
            {sansRacine ? (
              <InfoNote icon={Info}>
                Aucune catégorie de parc sur {siteNom} : crée-en une dans
                Équipements (ex. « Sécurité incendie »), puis reviens ici.
              </InfoNote>
            ) : (
              <SelectField
                control={form.control}
                name="parentId"
                label="Catégorie de parc"
                required
                placeholder="— Choisir une catégorie —"
                options={racines.map((c) => ({ value: c.id, label: c.nom }))}
              />
            )}
            <TextField
              control={form.control}
              name="nomFlotte"
              label="Nom de la flotte"
              required
            />
            {champs.length > 0 && (
              <SelectField
                control={form.control}
                name="valeurPrincipale"
                label="Valeur principale"
                optionAucune="— Aucune —"
                hint="Caractéristique collée au nom dans les listes (ex. « Extincteur N°1 »)."
                options={champs.map((c) => ({ value: c.cle, label: c.cle }))}
              />
            )}
          </>
        )}
      </FormDialog>
    </Form>
  )
}
