import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Ban,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Plus,
  ShieldCheck,
  ShieldOff,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '../queries'
import {
  useAnonymizeUser,
  useAssignSite,
  useToggleActif,
  useUnassignSite,
  useUpdateUser,
  useUpdateUserEmail,
} from '../mutations'
import { profileSchema, roleLabel } from '../schemas'
import { sitesQueries } from '@/features/sites/queries'
import { supabase } from '@/lib/supabase'
import * as perm from '@/lib/permissions'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { InfoNote } from '@/components/common/info-note'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { TextField } from '@/components/common/text-field'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

interface UserRow {
  id: string
  nom_complet: string
  est_actif: boolean
  anonymized_at: string | null
  role_id: number
  roles: { code: string; description: string | null } | null
}

export function UtilisateurDetail({
  userId,
  onBack,
}: {
  userId: string
  onBack: () => void
}) {
  const { data: role } = useCurrentRole()
  const isAdmin = perm.isAdmin(role)
  const { session } = useAuth()
  const isSelf = session?.user.id === userId

  const { data: users = [], isPending } = useQuery(utilisateursQueries.list())
  const user = users.find((u) => u.id === userId) as UserRow | undefined

  if (isPending) {
    return (
      <PageContainer>
        <Skeleton className="h-8 w-48" />
      </PageContainer>
    )
  }
  if (!user) {
    return (
      <PageContainer>
        <PageHeader
          title="Utilisateur introuvable"
          onBack={onBack}
          backLabel="Retour aux utilisateurs"
        />
        <EmptyState
          title="Utilisateur introuvable"
          description="Ce compte n'existe pas ou n'est pas accessible."
        />
      </PageContainer>
    )
  }

  const targetRole = user.roles?.code ?? ''
  const targetIsAdmin = perm.isAdmin(targetRole)
  const canEdit = perm.canEditUser(role, targetRole)

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <PageHeader
          title={user.nom_complet}
          description={roleLabel(targetRole)}
          breadcrumb={[{ label: 'Utilisateurs', onClick: onBack }]}
          titleBadges={
            <>
              <Badge variant={user.est_actif ? 'outline' : 'destructive'}>
                {user.est_actif ? 'Actif' : 'Inactif'}
              </Badge>
              {user.anonymized_at && <Badge variant="outline">Anonymisé</Badge>}
            </>
          }
        />

        <IdentityCard user={user} isAdmin={isAdmin} canEdit={canEdit} />

        {targetIsAdmin ? (
          <AdminSitesNotice />
        ) : (
          <SitesCard userId={userId} canEdit={canEdit} />
        )}

        {isAdmin && !isSelf && <AccountCard user={user} />}
      </div>
    </PageContainer>
  )
}

// --- Identité : nom, téléphone, rôle, e-mail ---

function IdentityCard({
  user,
  isAdmin,
  canEdit,
}: {
  user: UserRow
  isAdmin: boolean
  canEdit: boolean
}) {
  const { data: telephone, isPending } = useQuery(
    utilisateursQueries.telephone(user.id),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identité</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {isAdmin && (
          <>
            <EmailBlock userId={user.id} />
            <div className="bg-border h-px" />
          </>
        )}

        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ProfileForm
            key={user.id}
            user={user}
            initialTelephone={telephone ?? ''}
            isAdmin={isAdmin}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ProfileForm({
  user,
  initialTelephone,
  isAdmin,
  canEdit,
}: {
  user: UserRow
  initialTelephone: string
  isAdmin: boolean
  canEdit: boolean
}) {
  const update = useUpdateUser()
  const { data: roles = [] } = useQuery(utilisateursQueries.roles())
  const [nom, setNom] = useState(user.nom_complet)
  const [telephone, setTelephone] = useState(initialTelephone)
  const [roleId, setRoleId] = useState(user.role_id)
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleSubmit() {
    const parsed = profileSchema.safeParse({ nom_complet: nom, telephone })
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error))
      return
    }
    setErrors({})
    try {
      await update.mutateAsync({
        id: user.id,
        nom_complet: parsed.data.nom_complet,
        telephone: parsed.data.telephone,
        role_id: isAdmin ? roleId : undefined,
      })
      toast.success('Profil mis à jour')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <TextField
        label="Nom complet"
        value={nom}
        onChange={setNom}
        error={errors.nom_complet}
        required
        disabled={!canEdit}
      />
      <TextField
        label="Téléphone"
        value={telephone}
        onChange={setTelephone}
        error={errors.telephone}
        disabled={!canEdit}
      />
      <div className="grid gap-2">
        <Label htmlFor="role">Rôle</Label>
        {isAdmin ? (
          <Select
            id="role"
            value={String(roleId)}
            onChange={(e) => setRoleId(Number(e.target.value))}
          >
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {roleLabel(r.code)}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm">{roleLabel(user.roles?.code)}</p>
        )}
      </div>
      {canEdit && (
        <Button
          type="submit"
          disabled={update.isPending}
          className="self-start"
        >
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      )}
    </form>
  )
}

// --- Bloc e-mail (admin uniquement, dans la carte Identité) ---

function EmailBlock({ userId }: { userId: string }) {
  const {
    data: email = '',
    isPending,
    isError,
  } = useQuery(utilisateursQueries.email(userId))

  if (isPending) return <Skeleton className="h-20 w-full" />
  if (isError) {
    return (
      <p className="text-muted-foreground text-sm">
        Lecture de l’e-mail indisponible (l’Edge Function{' '}
        <code>update_user_email</code> n’est peut-être pas déployée).
      </p>
    )
  }
  return <EmailForm key={userId} userId={userId} current={email} />
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function EmailForm({ userId, current }: { userId: string; current: string }) {
  const updateEmail = useUpdateUserEmail()
  const [email, setEmail] = useState(current)
  const [error, setError] = useState<string | null>(null)

  const resetPassword = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.auth.resetPasswordForEmail(
        current,
        {
          redirectTo: `${window.location.origin}/definir-mot-de-passe`,
        },
      )
      if (err) throw err
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  async function handleSubmit() {
    setError(null)
    if (!EMAIL_RE.test(email.trim())) {
      setError('Adresse e-mail invalide.')
      return
    }
    try {
      await updateEmail.mutateAsync({ userId, email })
      toast.success('E-mail mis à jour')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void handleSubmit()
        }}
        className="flex flex-col gap-3"
      >
        <div className="grid gap-1">
          <Label htmlFor="email" className="text-base font-semibold">
            Adresse e-mail
          </Label>
          <p className="text-muted-foreground text-xs">
            Identifiant de connexion de l’utilisateur.
          </p>
        </div>
        <div className="grid gap-2">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 text-base"
          />
          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={updateEmail.isPending || email.trim() === current}
          className="self-start"
        >
          {updateEmail.isPending ? 'Mise à jour…' : 'Changer l’e-mail'}
        </Button>
      </form>

      <div className="bg-border h-px" />

      <div className="flex flex-col gap-2">
        <Label className="font-medium">Mot de passe</Label>
        <p className="text-muted-foreground text-xs">
          Le mot de passe ne peut jamais être lu. Envoie à l’utilisateur un lien
          pour qu’il définisse un nouveau mot de passe.
        </p>
        {resetPassword.isSuccess && (
          <InfoNote icon={Mail}>
            Lien de réinitialisation envoyé à <strong>{current}</strong>.
          </InfoNote>
        )}
        <Button
          variant="outline"
          disabled={resetPassword.isPending}
          onClick={() => resetPassword.mutate()}
          className="self-start"
        >
          <KeyRound />
          {resetPassword.isPending
            ? 'Envoi…'
            : resetPassword.isSuccess
              ? 'Renvoyer le lien'
              : 'Réinitialiser le mot de passe'}
        </Button>
      </div>
    </div>
  )
}

// --- Cible admin : pas d'attribution de sites ---

function AdminSitesNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès aux sites</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldCheck className="size-4 shrink-0" />
          <span>
            Administrateur : accès à <strong>tous les sites</strong>. Aucune
            attribution nécessaire.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Accès aux sites : liste attribuée + dropdown d'ajout ---

function SitesCard({ userId, canEdit }: { userId: string; canEdit: boolean }) {
  const { data: assigned = [], isPending } = useQuery(
    utilisateursQueries.sitesOf(userId),
  )
  const { data: mySites = [] } = useQuery(sitesQueries.mine())
  const assign = useAssignSite()
  const unassign = useUnassignSite()
  const [busy, setBusy] = useState<string | null>(null)

  const assignedIds = new Set(assigned.map((a) => a.site_id))
  const myIds = new Set(mySites.map((s) => s.id))
  // Sites de l'appelant attribués à la cible : modifiables (croix rouge).
  const editable = assigned.filter((a) => myIds.has(a.site_id))
  // Sites attribués hors du périmètre de l'appelant (donnés par un admin) :
  // affichés en lecture seule, non retirables.
  const horsPerimetre = assigned.filter((a) => !myIds.has(a.site_id))
  // Sites de l'appelant pas encore attribués : proposés dans le dropdown.
  const available = mySites.filter((s) => !assignedIds.has(s.id))

  function handleAdd(siteId: string) {
    if (!siteId) return
    setBusy(siteId)
    assign.mutate(
      { userId, siteId },
      {
        onSuccess: () => toast.success('Site ajouté'),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setBusy(null),
      },
    )
  }

  function handleRemove(siteId: string) {
    setBusy(siteId)
    unassign.mutate(
      { userId, siteId },
      {
        onSuccess: () => toast.success('Site retiré'),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setBusy(null),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accès aux sites</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {editable.length === 0 && horsPerimetre.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucun site attribué.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {editable.map((a) => (
                  <li
                    key={a.site_id}
                    className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{a.sites.nom}</span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive size-7"
                        aria-label={`Retirer ${a.sites.nom}`}
                        disabled={busy === a.site_id}
                        onClick={() => handleRemove(a.site_id)}
                      >
                        <X />
                      </Button>
                    )}
                  </li>
                ))}
                {horsPerimetre.map((a) => (
                  <li
                    key={a.site_id}
                    className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
                  >
                    <Lock className="size-3.5 shrink-0" />
                    <span className="truncate">{a.sites.nom}</span>
                    <span className="ml-auto text-xs">
                      hors de votre périmètre
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canEdit && available.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="add-site">Ajouter un site</Label>
                <div className="relative">
                  <Plus className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2" />
                  <Select
                    id="add-site"
                    value=""
                    onChange={(e) => handleAdd(e.target.value)}
                    className="pl-8"
                  >
                    <option value="">Choisir un site à ajouter…</option>
                    {available.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nom}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// --- Administration du compte (admin, hors soi-même) ---

function AccountCard({ user }: { user: UserRow }) {
  const toggle = useToggleActif()
  const anonymize = useAnonymizeUser()
  const [confirmToggle, setConfirmToggle] = useState(false)
  const [confirmAnon, setConfirmAnon] = useState(false)
  const isAnonymized = user.anonymized_at !== null

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <ShieldOff className="size-4" /> Administration du compte
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Actions sensibles. La désactivation coupe l’accès immédiatement ;
          l’anonymisation est irréversible.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setConfirmToggle(true)}>
            {user.est_actif ? (
              <>
                <Ban /> Désactiver
              </>
            ) : (
              <>
                <CheckCircle2 /> Réactiver
              </>
            )}
          </Button>
          {!isAnonymized && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmAnon(true)}
            >
              <ShieldOff /> Anonymiser
            </Button>
          )}
        </div>

        <ConfirmDialog
          open={confirmToggle}
          onOpenChange={setConfirmToggle}
          title={
            user.est_actif ? 'Désactiver ce compte ?' : 'Réactiver ce compte ?'
          }
          description={
            user.est_actif
              ? `« ${user.nom_complet} » perdra immédiatement l’accès.`
              : `« ${user.nom_complet} » pourra de nouveau se connecter.`
          }
          confirmLabel={user.est_actif ? 'Désactiver' : 'Réactiver'}
          destructive={user.est_actif}
          loading={toggle.isPending}
          onConfirm={() =>
            toggle.mutate(
              { id: user.id, estActif: !user.est_actif },
              {
                onSuccess: () => {
                  toast.success(
                    user.est_actif ? 'Compte désactivé' : 'Compte réactivé',
                  )
                  setConfirmToggle(false)
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        />

        <ConfirmDialog
          open={confirmAnon}
          onOpenChange={setConfirmAnon}
          title="Anonymiser cet utilisateur ?"
          description={`Les données personnelles de « ${user.nom_complet} » seront effacées (RGPD) et le compte désactivé. Irréversible.`}
          confirmLabel="Anonymiser"
          destructive
          loading={anonymize.isPending}
          onConfirm={() =>
            anonymize.mutate(user.id, {
              onSuccess: () => {
                toast.success('Utilisateur anonymisé')
                setConfirmAnon(false)
              },
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        />
      </CardContent>
    </Card>
  )
}
