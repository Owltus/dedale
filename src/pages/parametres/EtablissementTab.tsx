import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { typedResolver } from "@/lib/utils/form";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { etablissementSchema } from "@/lib/schemas/referentiels";
import {
  useEtablissement,
  useUpsertEtablissement,
  useTypesErp,
  useCategoriesErp,
} from "@/hooks/use-referentiels";

/// Fiche unique de l'établissement
export function EtablissementTab() {
  const { data: etablissement, isLoading } = useEtablissement();
  const { data: typesErp = [] } = useTypesErp();
  const { data: categories = [] } = useCategoriesErp();
  const upsertMutation = useUpsertEtablissement();

  const form = useForm({
    resolver: typedResolver(etablissementSchema),
    defaultValues: {
      nom: "",
      id_type_erp: null,
      id_categorie_erp: null,
      adresse: "",
      code_postal: "",
      ville: "",
    },
  });

  // Charger les données existantes
  useEffect(() => {
    if (etablissement) {
      form.reset({
        nom: etablissement.nom,
        id_type_erp: etablissement.id_type_erp,
        id_categorie_erp: etablissement.id_categorie_erp,
        adresse: etablissement.adresse ?? "",
        code_postal: etablissement.code_postal ?? "",
        ville: etablissement.ville ?? "",
      });
    }
  }, [etablissement, form]);

  const onSubmit = async (data: unknown) => {
    try {
      await upsertMutation.mutateAsync({ input: data } as never);
      toast.success("Établissement enregistré");
    } catch {
      // Erreur gérée par useInvokeMutation
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Établissement</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nom">Nom de l'établissement *</Label>
            <Input id="nom" {...form.register("nom")} />
            {form.formState.errors.nom && (
              <p className="text-sm text-destructive">{String(form.formState.errors.nom.message)}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="id_type_erp">Type ERP</Label>
              <Select value={form.watch("id_type_erp") ? String(form.watch("id_type_erp")) : undefined} items={Object.fromEntries(typesErp.map(t => [String(t.id_type_erp), `${t.code} — ${t.libelle}`]))} onValueChange={(v) => form.setValue("id_type_erp", v ? Number(v) : null)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— Aucun —" /></SelectTrigger>
                <SelectContent>
                  {typesErp.map((t) => (
                    <SelectItem key={t.id_type_erp} value={String(t.id_type_erp)}>{t.code} — {t.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="id_categorie_erp">Catégorie ERP</Label>
              <Select value={form.watch("id_categorie_erp") ? String(form.watch("id_categorie_erp")) : undefined} items={Object.fromEntries(categories.map(c => [String(c.id_categorie_erp), c.libelle]))} onValueChange={(v) => form.setValue("id_categorie_erp", v ? Number(v) : null)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— Aucune —" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id_categorie_erp} value={String(c.id_categorie_erp)}>{c.libelle}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adresse">Adresse</Label>
            <Input id="adresse" {...form.register("adresse")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code_postal">Code postal</Label>
              <Input id="code_postal" {...form.register("code_postal")} maxLength={5} />
              {form.formState.errors.code_postal && (
                <p className="text-sm text-destructive">{String(form.formState.errors.code_postal.message)}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ville">Ville</Label>
              <Input id="ville" {...form.register("ville")} />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={upsertMutation.isPending}>
              {upsertMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
