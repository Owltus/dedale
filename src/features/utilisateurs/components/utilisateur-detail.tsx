import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Plus,
  ShieldOff,
  Trash2,
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
import { ROLE_LABELS, profileSchema } from '../schemas'
import type { RoleCode } from '../schemas'
import { sitesQueries } from '@/features/sites/queries'
import { useCurrentRole } from '@/hooks/use-current-role'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { PageHeader } from '@/components/common/page-header'
import { TextField } from '@/components/common/text-field'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

const SUBORDINATE_ROLES = ['technicien', 'lecteur', 'demandeur']

const SELECT_CLASS =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border px-2 text-sm outline-none focus-visible:ring-[3px]'

function roleLabel(code: string | null | undefined): string {
  return code && code in ROLE_LABELS
    ? ROLE_LABELS[code as RoleCode]
    : (code ?? '—')
}

export function UtilisateurDetail({
  userId,
  onBack,
}: {
  userId: string
  onBack: () => void
}) {
  const { data: role } = useCurrentRole()
  const isAdmin = role === 'admin'
  const { session } = useAuth()
  const isSelf = session?.user.id === userId

  const { data: users = [], isPending } = useQuery(utilisateursQueries.list())
  const user = users.find((u) => u.id === userId) as UserRow | undefined

  if (isPending) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }
  if (!user) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft /> Retour
        </Button>
        <EmptyState title="Utilisateur introuvable" />
      </div>
    )
  }

  const targetIsSubordinate = SUBORDINATE_ROLES.includes(user.roles?.code ?? '')
  const canEdit = isAdmin || (role === 'manager' && targetIsSubordinate)

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
        <ArrowLeft /> Retour aux utilisateurs
      </Button>

      <PageHeader
        title={user.nom_complet}
        description={roleLabel(user.roles?.code)}
        action={
          <div className="flex items-center gap-2">
            <Badge variant={user.est_actif ? 'outline' : 'destructive'}>
              {user.est_actif ? 'Actif' : 'Inactif'}
            </Badge>
            {user.anonymized_at && <Badge variant="outline">Anonymisé</Badge>}
          </div>
        }
      />

      <div className="grid items-start gap-4 md:grid-cols-2">
        <ProfileSection user={user} isAdmin={isAdmin} canEdit={canEdit} />
        {isAdmin && <EmailSection userId={userId} />}
        <SitesSection userId={userId} canEdit={canEdit} />
        {isAdmin && !isSelf && <AccountSection user={user} />}
      </div>
    </div>
  )
}

// --- Profil (nom, téléphone, rôle) ---

function ProfileSection({
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
        <CardTitle>Profil</CardTitle>
      </CardHeader>
      <CardContent>
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
      {isAdmin && (
        <div className="grid gap-2">
          <Label htmlFor="role">Rôle</Label>
          <select
            id="role"
            value={String(roleId)}
            onChange={(e) => setRoleId(Number(e.target.value))}
            className={SELECT_CLASS}
          >
            {roles.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {roleLabel(r.code)}
              </option>
            ))}
          </select>
        </div>
      )}
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

// --- E-mail (admin) ---

function EmailSection({ userId }: { userId: string }) {
  const {
    data: email = '',
    isPending,
    isError,
  } = useQuery(utilisateursQueries.email(userId))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adresse e-mail</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : isError ? (
          <p className="text-muted-foreground text-sm">
            Lecture de l’e-mail indisponible (l’Edge Function{' '}
            <code>update_user_email</code> n’est peut-être pas déployée).
          </p>
        ) : (
          <EmailForm key={userId} userId={userId} current={email} />
        )}
      </CardContent>
    </Card>
  )
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function EmailForm({ userId, current }: { userId: string; current: string }) {
  const updateEmail = useUpdateUserEmail()
  const [email, setEmail] = useState(current)
  const [error, setError] = useState<string | null>(null)

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
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
  )
}

// --- Sites attribués ---

function SitesSection({
  userId,
  canEdit,
}: {
  userId: string
  canEdit: boolean
}) {
  const { data: assigned = [], isPending } = useQuery(
    utilisateursQueries.sitesOf(userId),
  )
  const { data: allSites = [] } = useQuery(sitesQueries.mine())
  const assign = useAssignSite()
  const unassign = useUnassignSite()
  const [toAdd, setToAdd] = useState('')

  const assignedIds = new Set(assigned.map((a) => a.site_id))
  const available = allSites.filter((s) => !assignedIds.has(s.id))

  function handleAssign() {
    if (!toAdd) return
    assign.mutate(
      { userId, siteId: toAdd },
      {
        onSuccess: () => {
          toast.success('Site attribué')
          setToAdd('')
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  function handleUnassign(siteId: string) {
    unassign.mutate(
      { userId, siteId },
      {
        onSuccess: () => toast.success('Site retiré'),
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sites attribués</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : assigned.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun site attribué.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {assigned.map((a) => (
              <li
                key={a.site_id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="truncate">{a.sites.nom}</span>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Retirer le site"
                    onClick={() => handleUnassign(a.site_id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && available.length > 0 && (
          <div className="flex items-end gap-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="add-site">Attribuer un site</Label>
              <select
                id="add-site"
                value={toAdd}
                onChange={(e) => setToAdd(e.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Choisir un site…</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </div>
            <Button
              onClick={handleAssign}
              disabled={!toAdd || assign.isPending}
            >
              <Plus /> Ajouter
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Compte (admin : activer/désactiver, anonymiser) ---

function AccountSection({ user }: { user: UserRow }) {
  const toggle = useToggleActif()
  const anonymize = useAnonymizeUser()
  const [confirmToggle, setConfirmToggle] = useState(false)
  const [confirmAnon, setConfirmAnon] = useState(false)
  const isAnonymized = user.anonymized_at !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compte</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
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
          <Button variant="ghost" onClick={() => setConfirmAnon(true)}>
            <ShieldOff /> Anonymiser
          </Button>
        )}

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
