import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Fusionne des classes Tailwind en dédoublonnant les conflits (p-2 + p-4 -> p-4). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
