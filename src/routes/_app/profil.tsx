import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Building2, KeyRound, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { utilisateursQueries } from '@/features/utilisateurs/queries'
import { useUpdateUser } from '@/features/utilisateurs/mutations'
import {
  profileSchema,
  roleLabel,
  type ProfileFormValues,
} from '@/features/utilisateurs/schemas'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth'
import { errorMessage, writeErrorMessage } from '@/lib/form'
import { useSiteContext } from '@/lib/site-context'
import { PageContainer } from '@/components/common/page-container'
import { PageHeader } from '@/components/common/page-header'
import { TextField } from '@/components/common/fields/text-field'
import { EmptyState } from '@/components/common/empty-state'
import { InfoNote } from '@/components/common/info-note'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Form } from '@/components/ui/form'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export const Route = createFileRoute('/_app/profil')({
  // Pas de requireNav : « Mon profil » est accessible à tout rôle connecté
  // (menu utilisateur, hors sidebar).
  component: ProfilPage,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const emailFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .regex(EMAIL_RE, 'Adresse e-mail invalide.'),
})
type EmailFormValues = z.infer<typeof emailFormSchema>

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
                <div className="h-px bg-border" />
                <ProfilForm
                  key={userId}
                  userId={userId}
                  initialNom={me.nom_complet}
                  initialTelephone={telephone}
                  role={me.roles.code}
                />
              </CardContent>
            </Card>

            <SitesCard />

            <SecurityCard email={email} />
          </>
        )}
      </div>
    </PageContainer>
  )
}

// --- E-mail (self-service : change l'identifiant de connexion) ---

function EmailBlock({ currentEmail }: { currentEmail: string }) {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: currentEmail },
  })

  const mutation = useMutation({
    mutationFn: async (newEmail: string) => {
      const { error: err } = await supabase.auth.updateUser({ email: newEmail })
      if (err) throw err
    },
    onSuccess: (_data, newEmail) => setSentTo(newEmail),
    onError: (e) => toast.error(errorMessage(e)),
  })

  function onSubmit(values: EmailFormValues) {
    setSentTo(null)
    mutation.mutate(values.email)
  }

  const emailValue = useWatch({ control: form.control, name: 'email' })
  const unchanged =
    emailValue.trim().toLowerCase() === currentEmail.toLowerCase()

  return (
    <Form {...form}>
      <form
        // L'événement DOIT être transmis : c'est lui qui porte le
        // preventDefault de react-hook-form. Sans lui, le navigateur soumet
        // nativement et recharge la page (l'idiome sans événement n'est
        // valable que pour le prop onSubmit de FormDialog, dont la coquille
        // fait déjà preventDefault + stopPropagation).
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-3"
      >
        <TextField
          control={form.control}
          name="email"
          type="email"
          label="Adresse e-mail"
          className="h-11 text-base"
          hint="Identifiant de connexion. Un e-mail de confirmation sera envoyé à la nouvelle adresse."
        />
        {sentTo && (
          <InfoNote icon={Mail}>
            Un lien de confirmation a été envoyé à <strong>{sentTo}</strong>.
            Clique dessus pour valider le changement — ton adresse actuelle
            reste active tant que ce n’est pas fait.
          </InfoNote>
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
    </Form>
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
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { nom_complet: initialNom, telephone: initialTelephone },
  })

  async function onSubmit(values: ProfileFormValues) {
    try {
      await update.mutateAsync({
        id: userId,
        nom_complet: values.nom_complet,
        telephone: values.telephone,
      })
      toast.success('Profil mis à jour')
    } catch (e) {
      toast.error(writeErrorMessage(e))
    }
  }

  return (
    <Form {...form}>
      <form
        // Idem EmailBlock : l'événement porte le preventDefault (cf. commentaire
        // ci-dessus). Sans lui, « Enregistrer » rechargeait l'application.
        onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
        className="flex flex-col gap-4"
      >
        <TextField
          control={form.control}
          name="nom_complet"
          label="Nom complet"
          required
        />
        <TextField control={form.control} name="telephone" label="Téléphone" />
        <div className="grid gap-2">
          <Label>Rôle</Label>
          <p className="text-sm">{roleLabel(role)}</p>
        </div>
        <Button
          type="submit"
          disabled={update.isPending}
          className="self-start"
        >
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </form>
    </Form>
  )
}

// --- Sites attribués (lecture seule) ---

function SitesCard() {
  const { sites, isPending } = useSiteContext()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes sites</CardTitle>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : sites.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun site ne t’est attribué pour le moment. Contacte un
            administrateur pour obtenir l’accès à un ou plusieurs sites.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sites.map((site) => (
              <li key={site.id} className="flex items-center gap-2 text-sm">
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="font-medium">{site.nom}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
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
          <InfoNote icon={Mail}>
            Un lien de réinitialisation a été envoyé à <strong>{email}</strong>.
            Ouvre-le pour définir un nouveau mot de passe.
          </InfoNote>
        ) : (
          <p className="text-sm text-muted-foreground">
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
