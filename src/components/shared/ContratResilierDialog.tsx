import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resiliationSchema, type ResiliationFormData } from "@/lib/schemas/contrats";

interface ResilierDialogProps {
  open: boolean; onOpenChange: (v: boolean) => void;
  onSubmit: (data: { date_notification: string; date_resiliation: string }) => Promise<void>; isLoading: boolean;
}

/// Dialogue de resiliation d'un contrat
export function ResilierContratDialog({ open, onOpenChange, onSubmit, isLoading }: ResilierDialogProps) {
  const form = useForm<ResiliationFormData>({
    resolver: zodResolver(resiliationSchema),
    defaultValues: { date_notification: new Date().toISOString().split("T")[0], date_resiliation: "" },
  });
  useEffect(() => { if (open) form.reset(); }, [open, form]);
  const e = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Resilier le contrat</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit as (data: unknown) => Promise<void>)} className="space-y-4">
          <div className="space-y-2">
            <Label>Date de notification *</Label>
            <Input type="date" {...form.register("date_notification")} />
            {e.date_notification && <p className="text-sm text-destructive">{String(e.date_notification.message)}</p>}
          </div>
          <div className="space-y-2">
            <Label>Date de resiliation *</Label>
            <Input type="date" {...form.register("date_resiliation")} />
            {e.date_resiliation && <p className="text-sm text-destructive">{String(e.date_resiliation.message)}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" variant="destructive" disabled={isLoading}>{isLoading ? "Resiliation..." : "Resilier"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
