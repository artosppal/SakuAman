import React, { useCallback, useContext, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api } from "@/src/lib/api";
import { useLanguage } from "@/src/context/LanguageContext";
import { EmptyState } from "@/src/components/ui";
import { EXPENSE_CATEGORIES, getExpenseCategory } from "@/src/constants/expenseCategories";
import { colors, font, fontSize, radius, spacing, shadow, webMaxWidth, formatRupiah } from "@/src/theme";

interface Txn {
  id: string;
  kind: "income" | "expense";
  amount: number;
  category: string;
  note?: string | null;
  date: string;
}

interface Budget {
  category: string;
  monthly_amount: number;
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export default function Transactions() {
  const insets = useSafeAreaInsets();
  const tabH = useContext(BottomTabBarHeightContext) ?? 64 + insets.bottom;
  const router = useRouter();
  const { t, locale } = useLanguage();

  const month = currentMonth();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [txRes, bRes]: any = await Promise.all([
        api.listTransactions(month),
        api.listBudgets(),
      ]);
      setTxns(txRes.transactions || []);
      setBudgets(bRes.budgets || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const totalExpense = useMemo(
    () => txns.filter((t) => t.kind === "expense").reduce((s, t) => s + t.amount, 0),
    [txns],
  );
  const totalIncome = useMemo(
    () => txns.filter((t) => t.kind === "income").reduce((s, t) => s + t.amount, 0),
    [txns],
  );

  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    txns.filter((t) => t.kind === "expense").forEach((t) => {
      map[t.category] = (map[t.category] || 0) + t.amount;
    });
    return map;
  }, [txns]);

  const headerHeight = insets.top + 118;

  const onAdd = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/transaction/form");
  };

  const dateLabel = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString(locale, { day: "numeric", month: "short" });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.header, { height: headerHeight, paddingTop: insets.top + spacing.sm }]}>
        {Platform.OS === "web" ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surface }]} />
        ) : (
          <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.headerTop}>
          <Text style={styles.title}>{t("transactions.title")}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{t("transactions.expenseThisMonth")}</Text>
            <Text style={[styles.summaryValue, { color: colors.error }]}>{formatRupiah(totalExpense)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{t("transactions.incomeThisMonth")}</Text>
            <Text style={[styles.summaryValue, { color: colors.brand }]}>{formatRupiah(totalIncome)}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={txns}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            paddingTop: headerHeight + spacing.md,
            paddingHorizontal: spacing.xl,
            paddingBottom: tabH + 90,
            width: "100%",
            maxWidth: webMaxWidth,
            alignSelf: "center",
          }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ marginBottom: spacing.lg }}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t("transactions.budgetsTitle")}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.budgetRow}>
                {budgets.map((b) => {
                  const cat = getExpenseCategory(b.category);
                  const spent = spentByCategory[b.category] || 0;
                  const pct = Math.min(100, (spent / b.monthly_amount) * 100);
                  const over = spent > b.monthly_amount;
                  return (
                    <Pressable
                      key={b.category}
                      testID={`budget-card-${b.category}`}
                      onPress={() => router.push({ pathname: "/budget/form", params: { category: b.category } })}
                      style={styles.budgetCard}
                    >
                      <View style={styles.budgetCardTop}>
                        <MaterialCommunityIcons name={cat.icon as any} size={16} color={cat.color} />
                        <Text style={styles.budgetCardLabel} numberOfLines={1}>
                          {t(`expenseCategories.${cat.key}`)}
                        </Text>
                      </View>
                      <View style={styles.budgetBarTrack}>
                        <View
                          style={[
                            styles.budgetBarFill,
                            { width: `${pct}%`, backgroundColor: over ? colors.error : colors.brand },
                          ]}
                        />
                      </View>
                      <Text style={[styles.budgetCardAmount, over && { color: colors.error }]}>
                        {formatRupiah(spent)} / {formatRupiah(b.monthly_amount)}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  testID="add-budget-card"
                  onPress={() => {
                    const unbudgeted = EXPENSE_CATEGORIES.find(
                      (c) => !budgets.some((b) => b.category === c.key),
                    );
                    router.push({
                      pathname: "/budget/form",
                      params: { category: unbudgeted?.key || "other" },
                    });
                  }}
                  style={styles.addBudgetCard}
                >
                  <MaterialCommunityIcons name="plus" size={22} color={colors.brand} />
                  <Text style={styles.addBudgetText}>{t("transactions.addBudget")}</Text>
                </Pressable>
              </ScrollView>

              <View style={[styles.sectionRow, { marginTop: spacing.lg }]}>
                <Text style={styles.sectionTitle}>{t("transactions.listTitle")}</Text>
              </View>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          renderItem={({ item }) => {
            const cat = getExpenseCategory(item.category);
            const isIncome = item.kind === "income";
            return (
              <Pressable
                testID={`txn-row-${item.id}`}
                onPress={() => router.push({ pathname: "/transaction/form", params: { id: item.id } })}
                style={styles.txnRow}
              >
                <View
                  style={[
                    styles.txnIcon,
                    { backgroundColor: isIncome ? colors.brand + "1A" : cat.color + "1A" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={isIncome ? "cash-plus" : (cat.icon as any)}
                    size={20}
                    color={isIncome ? colors.brand : cat.color}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txnNote} numberOfLines={1}>
                    {item.note || t(isIncome ? "transactions.incomeLabel" : `expenseCategories.${cat.key}`)}
                  </Text>
                  <Text style={styles.txnDate}>{dateLabel(item.date)}</Text>
                </View>
                <Text style={[styles.txnAmount, { color: isIncome ? colors.brand : colors.onSurface }]}>
                  {isIncome ? "+" : "-"}
                  {formatRupiah(item.amount)}
                </Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="wallet-outline"
              title={t("transactions.emptyTitle")}
              subtitle={t("transactions.emptySubtitle")}
            />
          }
        />
      )}

      <Pressable
        testID="add-transaction-fab"
        onPress={onAdd}
        style={({ pressed }) => [
          styles.fab,
          { bottom: tabH + spacing.md },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={28} color={colors.onBrandPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    justifyContent: "flex-end",
    paddingBottom: spacing.sm,
  },
  headerTop: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    width: "100%",
    maxWidth: webMaxWidth,
    alignSelf: "center",
  },
  title: { fontFamily: font.extrabold, fontSize: fontSize["2xl"], color: colors.onSurface },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    width: "100%",
    maxWidth: webMaxWidth,
    alignSelf: "center",
  },
  summaryBox: { flex: 1 },
  summaryLabel: { fontFamily: font.semibold, fontSize: fontSize.xs, color: colors.muted },
  summaryValue: { fontFamily: font.extrabold, fontSize: fontSize.lg },

  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sectionTitle: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },

  budgetRow: { gap: spacing.sm, paddingRight: spacing.lg },
  budgetCard: {
    width: 160,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  budgetCardTop: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm },
  budgetCardLabel: { flex: 1, fontFamily: font.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  budgetBarTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  budgetBarFill: { height: "100%", borderRadius: 3 },
  budgetCardAmount: { marginTop: spacing.xs, fontFamily: font.semibold, fontSize: fontSize.xs, color: colors.muted },
  addBudgetCard: {
    width: 120,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  addBudgetText: { fontFamily: font.semibold, fontSize: fontSize.xs, color: colors.brand, textAlign: "center" },

  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  txnIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  txnNote: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.onSurface },
  txnDate: { fontFamily: font.medium, fontSize: fontSize.xs, color: colors.muted, marginTop: 2 },
  txnAmount: { fontFamily: font.bold, fontSize: fontSize.base },

  fab: {
    position: "absolute",
    right: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
});
