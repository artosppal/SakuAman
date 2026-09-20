// Kategori pengeluaran rumah tangga — beda konsep dari kategori langganan
// digital (lihat categories.ts). Dipakai untuk transaksi & anggaran amplop.

export type ExpenseCategoryKey =
  | "food"
  | "transport"
  | "groceries"
  | "bills"
  | "health"
  | "education"
  | "entertainment"
  | "shopping"
  | "other";

export interface ExpenseCategoryDef {
  key: ExpenseCategoryKey;
  label: string;
  icon: string; // MaterialCommunityIcons name
  color: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryDef[] = [
  { key: "food", label: "Makan & Minum", icon: "food", color: "#F59E0B" },
  { key: "transport", label: "Transportasi", icon: "car", color: "#0EA5E9" },
  { key: "groceries", label: "Belanja Rumah Tangga", icon: "cart", color: "#06B6D4" },
  { key: "bills", label: "Tagihan", icon: "receipt", color: "#64748B" },
  { key: "health", label: "Kesehatan", icon: "heart-pulse", color: "#EC4899" },
  { key: "education", label: "Pendidikan", icon: "school", color: "#78716C" },
  { key: "entertainment", label: "Hiburan", icon: "movie-open", color: "#D946EF" },
  { key: "shopping", label: "Belanja Lain", icon: "shopping", color: "#8B5CF6" },
  { key: "other", label: "Lainnya", icon: "dots-horizontal-circle", color: "#71717A" },
];

export const EXPENSE_CATEGORY_MAP: Record<string, ExpenseCategoryDef> = EXPENSE_CATEGORIES.reduce(
  (acc, c) => {
    acc[c.key] = c;
    return acc;
  },
  {} as Record<string, ExpenseCategoryDef>,
);

export function getExpenseCategory(key?: string): ExpenseCategoryDef {
  return (key && EXPENSE_CATEGORY_MAP[key]) || EXPENSE_CATEGORY_MAP.other;
}
