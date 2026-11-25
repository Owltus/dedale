import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FolderTree, Info, ListChecks } from 'lucide-react'
import {
  useAnnulerDeploiement,
  useApercuDeploiement,
  useDeployerEquipements,
  type ParametresDeploiement,
} from '../mutations'
import { equipementsQueries } from '../queries'
import {
  champObligatoireManquant,
  estPrincipaleNomDuLieu,
  flottesDeployables,
  gabaritSousCategorie,
  messageErreurDeploiement,
  nbEquipements,
  valeurInitiale,
  valeursDeploiement,
  type ApercuDeploiement,
} from '../deploiement'
import { categoriesQueries } from '@/features/categories/queries'
import { modelesEquipementsQueries } from '@/features/modeles-equipements/queries'
import { SelecteurLieux } from '@/features/localisations/components/selecteur-lieux'
import { useConfirmDelete } from '@/hooks/use-confirm-delete'
import { formatChampValeur, type ChampValeur } from '@/lib/champs'
import { correspondRecherche } from '@/lib/recherche'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DialogShell } from '@/components/common/dialog-shell'
import { ChampValeurInput } from '@/components/common/champ-valeur-input'
import { CheckRow } from '@/components/common/checklist-dialog'
import { CheckboxList } from '@/components/common/checkbox-list'
import { ConfirmDeleteDialog } from '@/components/common/confirm-delete-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { ErrorState } from '@/components/common/error-state'
import { InfoNote } from '@/components/common/info-note'
import { SearchInput } from '@/components/common/search-input'
import {
  StandaloneCheckbox,
  StandaloneSelect,
} from '@/components/common/standalone-fields'

/** Plafond de la base (`deployer_equipements`) : au-delà, elle refuse. */
const LIEUX_MAX = 500

const ETAPES = ['flotte', 'lieux', 'valeurs', 'gammes', 'apercu'] as const
type Etape = (typeof ETAPES)[number]
const TITRE_ETAPE: Record<Etape, string> = {
  flotte: 'Famille d’équipements',
  lieux: 'Lieux',
  valeurs: 'Caractéristiques',
  gammes: 'Plans de maintenance',
  apercu: 'Aperçu',
}

interface DeploiementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  /** Sous-catégorie de parc pré-choisie (on vient de la famille). */
  categorieIdParDefaut?: string | null
  /** Lieux pré-cochés (on vient de la fiche d'un lieu). */
  localIdsParDefaut?: readonly string[]
}

/**
 * Déploiement EN MASSE d'une flotte (sous-catégorie de parc) dans plusieurs
 * lieux du site : assistant plein cadre en cinq étapes — famille → lieux →
 * caractéristiques → plans de maintenance → APERÇU calculé par la base
 * (`deployer_equipements` joué puis annulé), puis Confirmer. Rien n'est écrit
 * avant « Confirmer ». Le toast de succès propose « Annuler ce déploiement »
 * (aperçu de l'annulation, puis confirmation de suppression).
 *
 * À monter sous une garde STABLE (`canDeployerEquipements`) et sans `key` :
 * l'annulation proposée par le toast vit ici, après la fermeture de
 * l'assistant (qui, lui, est remonté à chaque ouverture).
 */
export function DeploiementDialog({
  open,
  onOpenChange,
  siteId,
  categorieIdParDefaut = null,
  localIdsParDefaut = [],
}: DeploiementDialogProps) {
  const apercuAnnulation = useAnnulerDeploiement()
  const annulation = useAnnulerDeploiement()
  const suppression = useConfirmDelete<string>({
    onDelete: (lot) => annulation.mutateAsync({ lot, appliquer: true }),
    successMessage: () =>
      `Déploiement annulé : ${nbEquipements(apercuAnnulation.data?.aSupprimer ?? 0)} supprimé${(apercuAnnulation.data?.aSupprimer ?? 0) > 1 ? 's' : ''}`,
    errorMessage: messageErreurDeploiement,
  })
  const apercu = apercuAnnulation.data
  const conserves = apercu?.conserves ?? []
  const retirees = (apercu?.gammes ?? []).filter(
    (g) => g.operationsRetirees > 0,
  )

  function annoncer(r: ApercuDeploiement) {
    const n = r.equipementIds.length
    const lot = r.lot
    toast.success(`${nbEquipements(n)} déployé${n > 1 ? 's' : ''}`, {
      description: r.sousCategorie.nom,
      duration: 15_000,
      action:
        lot === null
          ? undefined
          : {
              label: 'Annuler ce déploiement',
              onClick: () => {
                apercuAnnulation.mutate({ lot, appliquer: false })
                suppression.demander(lot)
              },
            },
    })
  }

  return (
    <>
      <AssistantDeploiement
        key={String(open)}
        open={open}
        onOpenChange={onOpenChange}
        siteId={siteId}
        categorieIdParDefaut={categorieIdParDefaut}
        localIdsParDefaut={localIdsParDefaut}
        onDeploye={annoncer}
      />
      <ConfirmDeleteDialog
        {...suppression.dialogProps}
        entityLabel={
          apercu?.aSupprimer === 1
            ? 'l’équipement de ce déploiement'
            : apercu
              ? `les ${nbEquipements(apercu.aSupprimer)} de ce déploiement`
              : 'les équipements de ce déploiement'
        }
        loadingImpacts={apercuAnnulation.isPending}
        blocked={apercuAnnulation.isError || apercu?.aSupprimer === 0}
        blockedReason={
          apercuAnnulation.isError
            ? messageErreurDeploiement(apercuAnnulation.error)
            : 'Tous les équipements de ce déploiement ont déjà un historique : il n’y a rien à supprimer.'
        }
        impactsTitle={
          conserves.length > 0
            ? `${nbEquipements(conserves.length)} conservé${conserves.length > 1 ? 's' : ''}, car déjà utilisé${conserves.length > 1 ? 's' : ''} :`
            : undefined
        }
        impacts={conserves.map((c) => `${c.lieu} (${c.raisons.join(', ')})`)}
        warning={
          apercu
            ? `Suppression définitive des équipements créés par ce déploiement, détachés de leurs plans de maintenance.${retirees.length > 0 ? ` Opérations retirées des ordres de travail ouverts : ${retirees.map((g) => `${g.nom} (${String(g.operationsRetirees)})`).join(', ')}.` : ''}`
            : undefined
        }
      />
    </>
  )
}

interface Saisies {
  categorieId: string
  valeurs: ChampValeur[]
}

function AssistantDeploiement({
  open,
  onOpenChange,
  siteId,
  categorieIdParDefaut,
  localIdsParDefaut,
  onDeploye,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteId: string
  categorieIdParDefaut: string | null
  localIdsParDefaut: readonly string[]
  onDeploye: (r: ApercuDeploiement) => void
}) {
  const categoriesQuery = useQuery(categoriesQueries.pool())
  // Lectures seulement modale ouverte : l'hôte la monte en permanence.
  const { data: modeles = [] } = useQuery(
    modelesEquipementsQueries.list(open ? siteId : null),
  )
  const gammesQuery = useQuery(
    equipementsQueries.gammesDeployables(open ? siteId : null),
  )
  const apercuMut = useApercuDeploiement()
  const deployer = useDeployerEquipements()

  const [etape, setEtape] = useState<Etape>('flotte')
  const [categorieId, setCategorieId] = useState(categorieIdParDefaut ?? '')
  const [localIds, setLocalIds] = useState<string[]>([...localIdsParDefaut])
  const [saisies, setSaisies] = useState<Saisies | null>(null)
  const [erreurValeurs, setErreurValeurs] = useState<string | null>(null)
  const [gammeIds, setGammeIds] = useState<string[]>([])
  const [rechercheGamme, setRechercheGamme] = useState('')
  const [ignorerDoublons, setIgnorerDoublons] = useState(true)
  // Aperçu rendu par la base ET les paramètres qui l'ont produit : Confirmer
  // envoie exactement ce qui a été montré.
  const [apercu, setApercu] = useState<{
    params: ParametresDeploiement
    resultat: ApercuDeploiement
  } | null>(null)

  const categories = categoriesQuery.data ?? []
  const flottes = flottesDeployables(categories, siteId)
  const flotte = flottes.find((f) => f.id === categorieId) ?? null
  const categorie = categories.find((c) => c.id === categorieId)
  const gabarit = categorie ? gabaritSousCategorie(categorie, modeles) : null
  const champs = gabarit?.champs ?? []
  const principale = flotte?.valeurPrincipale ?? null
  // Valeurs saisies POUR la famille choisie ; une autre famille repart du gabarit.
  const valeurs =
    saisies?.categorieId === categorieId
      ? saisies.valeurs
      : champs.map((c) => valeurInitiale(c, principale))
  const setValeur = (i: number, v: ChampValeur) => {
    setSaisies({
      categorieId,
      valeurs: valeurs.map((x, k) => (k === i ? v : x)),
    })
    setErreurValeurs(null)
  }

  const rang = ETAPES.indexOf(etape)
  const parametres = (ignorer: boolean): ParametresDeploiement => ({
    categorieId,
    localIds,
    valeurs: valeursDeploiement(champs, valeurs, principale),
    gammeIds,
    ignorerDoublons: ignorer,
  })

  async function calculerApercu(params: ParametresDeploiement) {
    try {
      const resultat = await apercuMut.mutateAsync(params)
      setApercu({ params, resultat })
      setEtape('apercu')
    } catch (e) {
      toast.error(messageErreurDeploiement(e))
    }
  }

  async function confirmer() {
    if (!apercu) return
    try {
      const r = await deployer.mutateAsync(apercu.params)
      onOpenChange(false)
      onDeploye(r)
    } catch (e) {
      toast.error(messageErreurDeploiement(e))
    }
  }

  function suivant() {
    if (etape === 'valeurs') {
      const manquant = champObligatoireManquant(champs, valeurs, principale)
      if (manquant !== null) {
        setErreurValeurs(`Le champ « ${manquant} » est obligatoire.`)
        return
      }
    }
    if (etape === 'gammes') {
      void calculerApercu(parametres(ignorerDoublons))
      return
    }
    const prochaine = ETAPES[rang + 1]
    if (prochaine) setEtape(prochaine)
  }

  function precedent() {
    const avant = ETAPES[rang - 1]
    if (!avant) return
    if (etape === 'apercu') setApercu(null)
    setEtape(avant)
  }

  const suivantPossible =
    etape === 'flotte'
      ? flotte !== null
      : etape === 'lieux'
        ? localIds.length > 0 && localIds.length <= LIEUX_MAX
        : true
  const enCours = apercuMut.isPending || deployer.isPending

  const footer = (
    <>
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        Annuler
      </Button>
      {rang > 0 && (
        <Button variant="outline" onClick={precedent} disabled={enCours}>
          Précédent
        </Button>
      )}
      {etape === 'apercu' ? (
        <Button
          onClick={() => void confirmer()}
          disabled={enCours || !apercu || apercu.resultat.aCreer === 0}
        >
          {deployer.isPending
            ? 'Déploiement…'
            : apercu && apercu.resultat.aCreer > 0
              ? `Créer ${nbEquipements(apercu.resultat.aCreer)}`
              : 'Rien à créer'}
        </Button>
      ) : (
        <Button onClick={suivant} disabled={!suivantPossible || enCours}>
          {etape === 'gammes'
            ? apercuMut.isPending
              ? 'Calcul de l’aperçu…'
              : 'Voir l’aperçu'
            : 'Suivant'}
        </Button>
      )}
    </>
  )

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Déployer des équipements"
      description={`Étape ${String(rang + 1)} sur ${String(ETAPES.length)} · ${TITRE_ETAPE[etape]}`}
      size="xl"
      contentClassName="sm:h-[85vh]"
      headerSeparator
      footerSeparator
      footer={footer}
    >
      {etape === 'flotte' &&
        (categoriesQuery.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : categoriesQuery.isError ? (
          <ErrorState onRetry={() => void categoriesQuery.refetch()} />
        ) : flottes.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="Aucune famille à déployer"
            description="Crée d’abord une sous-catégorie de parc dans Équipements."
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Un équipement de cette famille sera créé dans chaque lieu choisi,
              avec son gabarit de caractéristiques.
            </p>
            <StandaloneSelect
              label="Famille d’équipements"
              value={categorieId}
              onChange={(v) => {
                setCategorieId(v)
                setErreurValeurs(null)
              }}
              options={flottes.map((f) => ({
                value: f.id,
                label: `${f.categorie} › ${f.nom}`,
              }))}
              placeholder="— Choisir une famille —"
              required
              hint={
                gabarit
                  ? `${gabarit.modeleId ? 'Gabarit du modèle' : 'Gabarit propre à la famille'} · ${String(gabarit.champs.length)} caractéristique${gabarit.champs.length > 1 ? 's' : ''}`
                  : undefined
              }
            />
          </>
        ))}

      {etape === 'lieux' && (
        <>
          <p className="text-sm text-muted-foreground">
            Coche les lieux qui recevront un équipement. Cocher un bâtiment ou
            un niveau coche tous ses lieux affichés (filtre compris).
          </p>
          <SelecteurLieux
            siteId={siteId}
            value={localIds}
            onChange={setLocalIds}
          />
          {localIds.length > LIEUX_MAX && (
            <p className="text-sm text-destructive">
              Au plus {LIEUX_MAX} lieux par déploiement : découpe-le en
              plusieurs fois.
            </p>
          )}
        </>
      )}

      {etape === 'valeurs' &&
        (champs.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Aucune caractéristique"
            description="Cette famille n’a aucune caractéristique à renseigner."
          />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Valeurs communes à tous les équipements créés, pré-remplies avec
              les valeurs par défaut du gabarit.
            </p>
            {champs.some((c) => estPrincipaleNomDuLieu(c, principale)) && (
              <InfoNote icon={Info}>
                « {principale} » : laisse-la vide, chaque équipement prendra le
                nom de son lieu.
              </InfoNote>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {champs.map((c, i) => (
                <ChampValeurInput
                  key={c.cle}
                  champ={c}
                  value={valeurs[i] ?? null}
                  onChange={(v) => setValeur(i, v)}
                  placeholder={
                    estPrincipaleNomDuLieu(c, principale)
                      ? 'Nom du lieu'
                      : undefined
                  }
                />
              ))}
            </div>
            {erreurValeurs && (
              <p className="text-sm text-destructive">{erreurValeurs}</p>
            )}
          </>
        ))}

      {etape === 'gammes' && (
        <>
          <p className="text-sm text-muted-foreground">
            Facultatif : les équipements créés seront rattachés aux plans
            cochés, et leurs ordres de travail ouverts recevront les opérations
            correspondantes.
          </p>
          {gammesQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : gammesQuery.isError ? (
            <ErrorState onRetry={() => void gammesQuery.refetch()} />
          ) : gammesQuery.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Aucun plan de maintenance actif sur ce site.
            </p>
          ) : (
            <>
              <SearchInput
                value={rechercheGamme}
                onChange={setRechercheGamme}
                placeholder="Rechercher un plan de maintenance…"
              />
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {gammeIds.length === 0
                  ? 'Aucun plan coché'
                  : `${String(gammeIds.length)} plan${gammeIds.length > 1 ? 's' : ''} coché${gammeIds.length > 1 ? 's' : ''}`}
              </p>
              <CheckboxList
                bordered
                className="p-1"
                aria-label="Plans de maintenance"
              >
                {gammesQuery.data
                  .filter((g) => correspondRecherche(rechercheGamme, g.nom))
                  .map((g) => (
                    <CheckRow
                      key={g.id}
                      titre={g.nom}
                      sousTitre={
                        g.repeter_par_equipement
                          ? 'Opérations répétées par équipement'
                          : undefined
                      }
                      checked={gammeIds.includes(g.id)}
                      onToggle={() =>
                        setGammeIds((ids) =>
                          ids.includes(g.id)
                            ? ids.filter((x) => x !== g.id)
                            : [...ids, g.id],
                        )
                      }
                    />
                  ))}
              </CheckboxList>
            </>
          )}
        </>
      )}

      {etape === 'apercu' && apercu && (
        <ApercuDuDeploiement
          apercu={apercu.resultat}
          ignorerDoublons={ignorerDoublons}
          recalcul={apercuMut.isPending}
          onIgnorerDoublons={(v) => {
            setIgnorerDoublons(v)
            void calculerApercu(parametres(v))
          }}
        />
      )}
    </DialogShell>
  )
}

/** Nombre de doublons listés nommément (au-delà : « et N autres »). */
const DOUBLONS_LISTES = 8

/** L'aperçu TEL QUE RENDU par la base : chiffres, répartition, exemples, plans. */
function ApercuDuDeploiement({
  apercu,
  ignorerDoublons,
  recalcul,
  onIgnorerDoublons,
}: {
  apercu: ApercuDeploiement
  ignorerDoublons: boolean
  recalcul: boolean
  onIgnorerDoublons: (v: boolean) => void
}) {
  const sc = apercu.sousCategorie
  const nbDoublons = apercu.doublons.length
  return (
    <div className="space-y-5" aria-busy={recalcul}>
      <InfoNote icon={Info}>
        Aperçu calculé par la base : rien n’est encore enregistré.
      </InfoNote>
      <div className="space-y-1">
        <p className="text-base font-medium">
          {apercu.aCreer === 0
            ? 'Aucun équipement à créer'
            : `${nbEquipements(apercu.aCreer)} à créer`}
          {' · '}
          {apercu.lieuxDemandes} lieu{apercu.lieuxDemandes > 1 ? 'x' : ''}{' '}
          choisi{apercu.lieuxDemandes > 1 ? 's' : ''}
        </p>
        <p className="text-sm text-muted-foreground">
          {[sc.categorie, sc.nom].filter(Boolean).join(' › ')}
          {sc.modele ? ` · modèle « ${sc.modele} »` : ''} · {apercu.site}
        </p>
      </div>

      {nbDoublons > 0 && (
        <section className="space-y-2" aria-label="Lieux déjà équipés">
          <h3 className="text-sm font-medium">
            {nbDoublons} lieu{nbDoublons > 1 ? 'x ont' : ' a'} déjà un
            équipement de cette famille
          </h3>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {apercu.doublons.slice(0, DOUBLONS_LISTES).map((d) => (
              <li key={d.localId}>
                {d.lieu} ({d.batiment} / {d.niveau}) — {d.existants} existant
                {d.existants > 1 ? 's' : ''}
              </li>
            ))}
            {nbDoublons > DOUBLONS_LISTES && (
              <li>et {nbDoublons - DOUBLONS_LISTES} autre(s)</li>
            )}
          </ul>
          <StandaloneCheckbox
            label="Ignorer ces lieux (ne pas y créer de second équipement)"
            value={ignorerDoublons}
            onChange={onIgnorerDoublons}
            disabled={recalcul}
          />
        </section>
      )}

      {apercu.parBatimentNiveau.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Par bâtiment et niveau</h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Bâtiment</th>
                  <th className="px-3 py-2 font-medium">Niveau</th>
                  <th className="px-3 py-2 text-right font-medium">À créer</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Déjà équipés
                  </th>
                </tr>
              </thead>
              <tbody>
                {apercu.parBatimentNiveau.map((p) => (
                  <tr
                    key={`${p.batiment}/${p.niveau}`}
                    className="border-t tabular-nums"
                  >
                    <td className="px-3 py-2">{p.batiment}</td>
                    <td className="px-3 py-2">{p.niveau}</td>
                    <td className="px-3 py-2 text-right">{p.aCreer}</td>
                    <td className="px-3 py-2 text-right">{p.doublons}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {apercu.exemples.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Exemples d’équipements créés</h3>
          <ul className="grid gap-2 sm:grid-cols-3">
            {apercu.exemples.map((e) => (
              <li key={e.lieu} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{e.libelle}</p>
                <p className="text-xs text-muted-foreground">dans {e.lieu}</p>
                {e.champs.length > 0 && (
                  <dl className="mt-2 space-y-0.5 text-xs">
                    {e.champs.map((c) => (
                      <div key={c.cle} className="flex gap-1">
                        <dt className="text-muted-foreground">{c.cle} :</dt>
                        <dd>{formatChampValeur(c, c.valeur ?? null)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Plans de maintenance</h3>
        {apercu.gammes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun plan rattaché : les équipements pourront l’être plus tard
            depuis leur fiche.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {apercu.gammes.map((g) => (
              <li key={g.id}>
                <span className="font-medium">{g.nom}</span>
                <span className="text-muted-foreground">
                  {' — '}
                  {g.otOuverts} ordre{g.otOuverts > 1 ? 's' : ''} de travail
                  ouvert{g.otOuverts > 1 ? 's' : ''}
                  {g.operationsAjoutees > 0
                    ? ` · ${String(g.operationsAjoutees)} opération${g.operationsAjoutees > 1 ? 's' : ''} ajoutée${g.operationsAjoutees > 1 ? 's' : ''}`
                    : ' · aucune opération ajoutée'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
