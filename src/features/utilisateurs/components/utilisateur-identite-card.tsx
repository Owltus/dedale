import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { KeyRound, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '../queries'
import { useUpdateUser, useUpdateUserEmail } from '../mutations'
import { profileSchema, roleLabel } from '../schemas'
import type { ProfileFormValues } from '../schemas'
import type { UserRow } from './utilisateur-types'
import { supabase } from '@/lib/supabase'
import { errorMessage, writeErrorMessage } from '@/lib/form'
import { InfoNote } from '@/components/common/info-note'
import { TextField } from '@/components/common/fields/text-field'
import { Form } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// --- Identité : nom, téléphone, rôle, e-mail ---

export function IdentityCard({
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
  const [roleId, setRoleId] = useState(user.role_id)
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nom_complet: user.nom_complet,
      telephone: initialTelephone,
    },
  })

  async function onSubmit(data: ProfileFormValues) {
    try {
      await update.mutateAsync({
        id: user.id,
        nom_complet: data.nom_complet,
        telephone: data.telephone,
        role_id: isAdmin ? roleId : undefined,
      })
      toast.success('Profil mis à jour')
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-4"
      >
        <TextField
          control={form.control}
          name="nom_complet"
          label="Nom complet"
          required
          disabled={!canEdit}
        />
        <TextField
          control={form.control}
          name="telephone"
          label="Téléphone"
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
    </Form>
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

// Schéma e-mail local (pas de source dans schemas.ts) : validation identique à
// l'ancien contrôle EMAIL_RE sur la valeur détourée, valeur laissée telle quelle.
const emailSchema = z.object({
  email: z
    .string()
    .refine((v) => EMAIL_RE.test(v.trim()), 'Adresse e-mail invalide.'),
})
type EmailFormValues = z.infer<typeof emailSchema>

function EmailForm({ userId, current }: { userId: string; current: string }) {
  const updateEmail = useUpdateUserEmail()
  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: current },
  })
  const email = useWatch({ control: form.control, name: 'email' })

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

  async function onSubmit(data: EmailFormValues) {
    try {
      await updateEmail.mutateAsync({ userId, email: data.email })
      toast.success('E-mail mis à jour')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
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
            {...form.register('email')}
            className="h-11 text-base"
          />
          {form.formState.errors.email && (
            <p className="text-destructive text-sm">
              {form.formState.errors.email.message}
            </p>
          )}
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
