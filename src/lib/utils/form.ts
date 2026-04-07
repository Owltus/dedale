import { type FieldValues, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

/**
 * Wrapper typé autour de zodResolver pour Zod v4.
 *
 * Zod v4 utilise `z.coerce` dont le type d'entrée est `unknown`,
 * ce qui rend le Resolver incompatible avec useForm<OutputType>.
 * Ce helper retourne un Resolver typé avec le type de sortie du schéma,
 * ce qui permet d'utiliser useForm<FormData> sans cast inline.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function typedResolver<TOutput extends FieldValues>(
  schema: z.ZodType<TOutput, any>,
): Resolver<TOutput> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return zodResolver(schema as any) as Resolver<TOutput>;
}
