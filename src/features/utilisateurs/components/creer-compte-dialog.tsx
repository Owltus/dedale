import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import {
  CASCADE,
  ROLE_LABELS,
  creerCompteSchema,
  emptyCreerCompte,
} from '../schemas'
import type { CreerCompteFormValues, RoleCode } from '../schemas'
import { useCreerCompte } from '../mutations'
import { sitesQueries } from '@/features/sites/queries'
import { useSubmitDialog } from '@/hooks/use-submit-dialog'
import { Form } from '@/components/ui/form'
import { FormDialog } from '@/components/common/form-dialog'
import { Label } from '@/components/ui/label'
import { CheckRow } from '@/components/common/checklist-dialog'
import { CheckboxList } from '@/components/common/checkbox-list'
import { PasswordRules } from '@/components/common/password-rules'
import { TextField } from '@/components/common/fields/text-field'
import { PasswordField } from '@/components/common/fields/password-field'
import { SelectField } from '@/components/common/fields/select-field'

interface CreerCompteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Rôle de l'appelant — détermine les rôles créables (cascade). */
  callerRole: RoleCode
}

/**
 * Création d'un compte : identité, accès, puis identifiants de connexion.
 *
 * Le mot de passe est saisi ici et n'est JAMAIS restitué ensuite (décision PO) :
 * ni encart après création, ni bouton de copie. Il ne transite donc pas par le
 * presse-papiers et n'apparaît sur aucun écran une fois la fenêtre fermée —
 * d'où le rappel explicite dans la description. Un mot de passe non noté se
 * redéfinit depuis la fiche de la personne, il ne se retrouve pas.
 */
export function CreerCompteDialog({
  open,
  onOpenChange,
  callerRole,
}: CreerCompteDialogProps) {
  const creer = useCreerCompte()
  // Sites que l'appelant peut rattacher (admin = tous, sinon ses sites).
  const { data: sites = [] } = useQuery(sitesQueries.mine())
  const rolesCreables = CASCADE[callerRole]

  const form = useForm<CreerCompteFormValues>({
    resolver: zodResolver(creerCompteSchema),
    defaultValues: {
      ...emptyCreerCompte,
      role: rolesCreables[0] ?? 'technicien',
    },
  })
  const submit = useSubmitDialog<CreerCompteFormValues, string>({
    // Le toast dépend de l'e-mail SAISI : on le renvoie comme résultat pour que
    // `successMessage` (fonction du résultat) l'affiche.
    onSubmit: async (data) => {
      await creer.mutateAsync(data)
      return data.email
    },
    successMessage: (email) => `Compte créé pour ${email}`,
    close: () => onOpenChange(false),
  })

  const role = useWatch({ control: form.control, name: 'role' })
  const password = useWatch({ control: form.control, name: 'password' })
  const roleOptions = rolesCreables.map((code) => ({
    value: code,
    label: ROLE_LABELS[code],
  }))

  return (
    <Form {...form}>
      <FormDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Créer un compte"
        description="Le compte est utilisable immédiatement. Aucun e-mail n’est envoyé : notez le mot de passe et transmettez-le à la personne, il ne sera plus affiché."
        onSubmit={() => void form.handleSubmit(submit)()}
        submitLabel="Créer le compte"
        pendingLabel="Création…"
        pending={form.formState.isSubmitting}
        size="lg"
      >
        {/* Ordre de lecture : QUI est la personne, à QUOI elle a accès, puis
            COMMENT elle se connecte. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            control={form.control}
            name="nom_complet"
            label="Nom complet"
            required
          />
          <TextField
            control={form.control}
            name="email"
            label="Adresse e-mail"
            type="email"
            autoComplete="off"
            required
          />
        </div>

        <SelectField
          control={form.control}
          name="role"
          label="Rôle"
          required
          options={roleOptions}
        />

        <div className="grid gap-2">
          <Label id="creer-compte-sites-label">Sites</Label>
          {sites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun site disponible.
            </p>
          ) : (
            <Controller
              control={form.control}
              name="site_ids"
              render={({ field }) => (
                <CheckboxList
                  role="group"
                  aria-labelledby="creer-compte-sites-label"
                  className="flex flex-col gap-1 rounded-md border border-input p-2"
                >
                  {sites.map((site) => (
                    // CheckRow (et non un label recomposé) : elle porte le lien
                    // htmlFor/useId entre la case et son libellé.
                    <CheckRow
                      key={site.id}
                      titre={site.nom}
                      checked={field.value.includes(site.id)}
                      className="rounded px-1 py-1 hover:bg-muted"
                      onToggle={() => {
                        field.onChange(
                          field.value.includes(site.id)
                            ? field.value.filter((s: string) => s !== site.id)
                            : [...field.value, site.id],
                        )
                      }}
                    />
                  ))}
                </CheckboxList>
              )}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {role === 'admin'
              ? 'Un administrateur a accès à tous les sites, le rattachement est facultatif.'
              : 'Les sites définissent le périmètre visible par l’utilisateur.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField
            control={form.control}
            name="password"
            label="Mot de passe"
            autoComplete="new-password"
            required
          />
          <PasswordField
            control={form.control}
            name="password_confirm"
            label="Confirmer le mot de passe"
            autoComplete="new-password"
            required
          />
          {/* Les consignes sous les deux champs, sur toute la largeur : elles
              portent sur le couple, pas sur l'un des deux. */}
          <PasswordRules value={password} className="sm:col-span-2" />
        </div>
      </FormDialog>
    </Form>
  )
}
