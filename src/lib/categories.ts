export const CATEGORIES = ["Financials", "Strategy", "Product", "Legal", "Other"] as const;

export type Category = (typeof CATEGORIES)[number];

/** Sort category names by the preferred display order defined in CATEGORIES */
export function sortCategories(categories: string[]): string[] {
  const order = CATEGORIES as readonly string[];
  return [...categories].sort((a, b) => {
    const ai = order.indexOf(a as Category);
    const bi = order.indexOf(b as Category);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

/**
 * Returns inline style object for category badges.
 * Uses inline styles instead of Tailwind classes to avoid purging issues.
 */
export function getCategoryStyle(category: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  switch (category) {
    case "Financials":
    case "Financial": // legacy
      return { backgroundColor: "#ecfdf5", color: "#047857", borderColor: "#a7f3d0" };
    case "Product":
      return { backgroundColor: "#f5f3ff", color: "#6d28d9", borderColor: "#c4b5fd" };
    case "Strategy":
      return { backgroundColor: "#fffbeb", color: "#b45309", borderColor: "#fcd34d" };
    case "Legal":
      return { backgroundColor: "#f0f9ff", color: "#0369a1", borderColor: "#7dd3fc" };
    case "Team": // legacy
      return { backgroundColor: "#fdf2f8", color: "#be185d", borderColor: "#f9a8d4" };
    default:
      return { backgroundColor: "#f4f4f5", color: "#52525b", borderColor: "#d4d4d8" };
  }
}
