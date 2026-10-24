export type Appearance = "dark" | "light";
export const APPEARANCE_KEY = "mg-pro-appearance";

export function resolveAppearance(saved: string | null): Appearance {
  return saved === "light" ? "light" : "dark";
}