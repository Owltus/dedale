import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { useUpdateUser } from '@/features/utilisateurs/mutations'
import { ROLE_LABELS, profileSchema } from '@/features/utilisateurs/schemas'
import type { RoleCode } from '@/features/utilisateurs/schemas'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth'
import { errorMessage, fieldErrors } from '@/lib/form'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { TextField } from '@/components/common/text-field'
import { EmptyState } from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/profil')({
  component: ProfilPage,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function roleLabel(code: string | null | undefined): string {
  return code && code in ROLE_LABELS
    ? ROLE_LABELS[code as RoleCode]
    : (code ?? '—')
}

function ProfilPage() {
  const { session } = useAuth()
  const userId = session?.user.id ?? ''
  const email = session?.user.email ?? ''

  const { data: me, isPending } = useQuery({
    ...utilisateursQueries.me(userId),
    enabled: userId !== '',
  })
  const { data: telephone = '', isPending: telPending } = useQuery({
    ...utilisateursQueries.telephone(userId),
    enabled: userId !== '',
  })

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <PageHeader
          title="Mon profil"
          description="Gère tes informations personnelles et ta sécurité."
        />

        {isPending || telPending ? (
          <Skeleton className="h-64 w-full" />
        ) : !me ? (
          <EmptyState title="Profil introuvable" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Identité</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <EmailBlock currentEmail={email} />
                <div className="bg-border h-px" />
                <ProfilForm
                  key={userId}
                  userId={userId}
                  initialNom={me.nom_complet}
                  initialTelephone={telephone}
                  role={me.roles.code}
                />
              </CardContent>
            </Card>

            <SecurityCard email={email} />
          </>
        )}
      </div>
    </PageContainer>
  )
}

// --- E-mail (self-service : change l'identifiant de connexion) ---

function EmailBlock({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState(currentEmail)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error: err } = await supabase.auth.updateUser({ email: newEmail })
      if (err) throw err
    },
    onSuccess: (_data, newEmail) => setSentTo(newEmail),
    onError: (e) => toast.error(errorMessage(e)),
  })

  function handleSubmit() {
    setError(null)
    setSentTo(null)
    const value = email.trim().toLowerCase()
    if (!EMAIL_RE.test(value)) {
      setError('Adresse e-mail invalide.')
      return
    }
    mutation.mutate(value)
  }

  const unchanged = email.trim().toLowerCase() === currentEmail.toLowerCase()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        handleSubmit()
      }}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-1">
        <Label htmlFor="email" className="text-base font-semibold">
          Adresse e-mail
        </Label>
        <p className="text-muted-foreground text-xs">
          Identifiant de connexion. Un e-mail de confirmation sera envoyé à la
          nouvelle adresse.
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
      {sentTo && (
        <div className="border-primary/20 bg-primary/5 flex items-start gap-2 rounded-md border p-3 text-sm">
          <Mail className="text-primary mt-0.5 size-4 shrink-0" />
          <span>
            Un lien de confirmation a été envoyé à <strong>{sentTo}</strong>.
            Clique dessus pour valider le changement — ton adresse actuelle
            reste active tant que ce n’est pas fait.
          </span>
        </div>
      )}
      <Button
        type="submit"
        variant="outline"
        disabled={mutation.isPending || unchanged}
        className="self-start"
      >
        {mutation.isPending ? 'Envoi…' : 'Changer l’e-mail'}
      </Button>
    </form>
  )
}

// --- Profil : nom, téléphone (modifiables) ; rôle (lecture) ---

function ProfilForm({
  userId,
  initialNom,
  initialTelephone,
  role,
}: {
  userId: string
  initialNom: string
  initialTelephone: string
  role: string
}) {
  const update = useUpdateUser()
  const [nom, setNom] = useState(initialNom)
  const [telephone, setTelephone] = useState(initialTelephone)
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
        id: userId,
        nom_complet: parsed.data.nom_complet,
        telephone: parsed.data.telephone,
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
      />
      <TextField
        label="Téléphone"
        value={telephone}
        onChange={setTelephone}
        error={errors.telephone}
      />
      <div className="grid gap-2">
        <Label>Rôle</Label>
        <p className="text-sm">{roleLabel(role)}</p>
      </div>
      <Button type="submit" disabled={update.isPending} className="self-start">
        {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
      </Button>
    </form>
  )
}

// --- Sécurité : réinitialisation du mot de passe par e-mail ---

function SecurityCard({ email }: { email: string }) {
  const [sent, setSent] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/definir-mot-de-passe`,
      })
      if (err) throw err
    },
    onSuccess: () => setSent(true),
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sécurité</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sent ? (
          <div className="border-primary/20 bg-primary/5 flex items-start gap-2 rounded-md border p-3 text-sm">
            <Mail className="text-primary mt-0.5 size-4 shrink-0" />
            <span>
              Un lien de réinitialisation a été envoyé à{' '}
              <strong>{email}</strong>. Ouvre-le pour définir un nouveau mot de
              passe.
            </span>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Reçois un lien par e-mail pour définir un nouveau mot de passe en
            toute sécurité.
          </p>
        )}
        <Button
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate()}
          className="self-start"
        >
          <KeyRound />
          {mutation.isPending
            ? 'Envoi…'
            : sent
              ? 'Renvoyer le lien'
              : 'Réinitialiser mon mot de passe'}
        </Button>
      </CardContent>
    </Card>
  )
}
