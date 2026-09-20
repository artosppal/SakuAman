import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Input, Button } from "@/src/components/ui";
import { getExpenseCategory } from "@/src/constants/expenseCategories";
import { api, ApiError } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";
import { useLanguage } from "@/src/context/LanguageContext";
import { colors, font, fontSize, radius, spacing } from "@/src/theme";

export default function BudgetForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ category: string }>();
  const cat = getExpenseCategory(params.category);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState("");
  const [hasBudget, setHasBudget] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res: any = await api.listBudgets();
        const found = (res.budgets || []).find((b: any) => b.category === params.category);
        if (found) {
          setAmount(String(found.monthly_amount));
          setHasBudget(true);
        }
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [params.category]);

  const save = async () => {
    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
    if (amountNum <= 0) {
      toast.show(t("budgetForm.errAmountRequired"), "error");
      return;
    }
    setSaving(true);
    try {
      await api.setBudget(params.category as string, amountNum);
      toast.show(t("budgetForm.saved"), "success");
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        toast.show(e.message, "error");
        return;
      }
      toast.show(t("budgetForm.errSave"), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.deleteBudget(params.category as string);
      toast.show(t("budgetForm.removed"), "info");
      router.back();
    } catch {
      toast.show(t("budgetForm.errSave"), "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="close-budget-form" onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>{t("budgetForm.title")}</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
        bottomOffset={90}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.catRow}>
          <View style={[styles.catIcon, { backgroundColor: cat.color + "1A" }]}>
            <MaterialCommunityIcons name={cat.icon as any} size={22} color={cat.color} />
          </View>
          <Text style={styles.catLabel}>{t(`expenseCategories.${cat.key}`)}</Text>
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <Input
            testID="budget-amount-input"
            label={t("budgetForm.amountLabel")}
            icon="cash"
            placeholder="0"
            hint={t("budgetForm.amountHint")}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
        </View>

        {hasBudget && (
          <Pressable testID="remove-budget-button" style={styles.removeBtn} onPress={remove}>
            <MaterialCommunityIcons name="close-circle-outline" size={20} color={colors.error} />
            <Text style={styles.removeText}>{t("budgetForm.removeButton")}</Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button testID="save-budget-button" title={t("budgetForm.save")} onPress={save} loading={saving} />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  headerBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },

  catRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  catIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  catLabel: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },

  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#FEE2E2",
  },
  removeText: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.error },

  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
