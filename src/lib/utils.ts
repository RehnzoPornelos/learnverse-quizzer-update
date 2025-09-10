import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Concatenate class names conditionally and merge them with Tailwind's
 * conflict resolution. Useful for composing dynamic className values.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}