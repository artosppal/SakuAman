import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Input, Button } from "@/src/components/ui";
import { EXPENSE_CATEGORIES } from "@/src/constants/expenseCategories";
import { api, ApiError } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";
import { useLanguage } from "@/src/context/LanguageContext";
import { colors, font, fontSize, radius, spacing, shadow } from "@/src/theme";

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

const webDateInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  fontFamily: font.semibold,
  fontSize: fontSize.lg,
  color: colors.onSurface,
  paddingTop: 14,
  paddingBottom: 14,
  paddingLeft: 0,
  paddingRight: 0,
};

export default function TransactionForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { t, locale } = useLanguage();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => toISO(new Date()));
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const res: any = await api.listTransactions();
        const found = (res.transactions || []).find((x: any) => x.id === params.id);
        if (!found) throw new Error("not found");
        setKind(found.kind);
        setAmount(String(found.amount ?? ""));
        setCategory(found.category || "food");
        setNote(found.note || "");
        setDate(found.date);
      } catch {
        toast.show(t("transactionForm.errLoad"), "error");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [editing, params.id]);

  const save = async () => {
    const amountNum = parseFloat(amount.replace(/[^0-9.]/g, "")) || 0;
    if (amountNum <= 0) {
      toast.show(t("transactionForm.errAmountRequired"), "error");
      return;
    }
    const body = { kind, amount: amountNum, category, note: note.trim() || null, date };
    setSaving(true);
    try {
      if (editing) {
        await api.updateTransaction(params.id as string, body);
      } else {
        await api.createTransaction(body);
      }
      toast.show(editing ? t("transactionForm.updated") : t("transactionForm.created"), "success");
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        toast.show(e.message, "error");
        return;
      }
      toast.show(t("transactionForm.errSave"), "error");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    try {
      await api.deleteTransaction(params.id as string);
      toast.show(t("transactionForm.deleted"), "info");
      router.back();
    } catch {
      toast.show(t("transactionForm.errDelete"), "error");
    }
  };

  const dateDisplay = (() => {
    const d = new Date(date + "T00:00:00");
    if (isNaN(d.getTime())) return date;
    return d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  })();

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
        <Pressable testID="close-form-button" onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {editing ? t("transactionForm.editTitle") : t("transactionForm.createTitle")}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
        bottomOffset={90}
        showsVerticalScrollIndicator={false}
      >
        {/* Kind */}
        <Text style={styles.label}>{t("transactionForm.kindLabel")}</Text>
        <View style={styles.segment}>
          <Pressable
            testID="kind-expense"
            onPress={() => setKind("expense")}
            style={[styles.segmentItem, kind === "expense" && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, kind === "expense" && styles.segmentTextActive]}>
              {t("transactionForm.kindExpense")}
            </Text>
          </Pressable>
          <Pressable
            testID="kind-income"
            onPress={() => setKind("income")}
            style={[styles.segmentItem, kind === "income" && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, kind === "income" && styles.segmentTextActive]}>
              {t("transactionForm.kindIncome")}
            </Text>
          </Pressable>
        </View>

        {/* Amount */}
        <View style={{ marginTop: spacing.lg }}>
          <Input
            testID="txn-amount-input"
            label={t("transactionForm.amountLabel")}
            icon="cash"
            placeholder="0"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
          />
        </View>

        {/* Category (expense only) */}
        {kind === "expense" && (
          <>
            <Text style={styles.label}>{t("transactionForm.categoryLabel")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
              {EXPENSE_CATEGORIES.map((c) => {
                const active = category === c.key;
                return (
                  <Pressable
                    key={c.key}
                    testID={`form-cat-${c.key}`}
                    onPress={() => setCategory(c.key)}
                    style={[styles.catChip, active && { backgroundColor: c.color + "1A", borderColor: c.color }]}
                  >
                    <MaterialCommunityIcons
                      name={c.icon as any}
                      size={18}
                      color={active ? c.color : colors.muted}
                    />
                    <Text style={[styles.catChipText, active && { color: c.color }]}>
                      {t(`expenseCategories.${c.key}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Date */}
        <Text style={styles.label}>{t("transactionForm.dateLabel")}</Text>
        {Platform.OS === "web" ? (
          <View style={styles.dateBox}>
            <MaterialCommunityIcons name="calendar" size={20} color={colors.brand} />
            <input
              data-testid="txn-date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={webDateInputStyle}
            />
          </View>
        ) : (
          <Pressable testID="txn-date-button" style={styles.dateBox} onPress={() => setShowPicker(true)}>
            <MaterialCommunityIcons name="calendar" size={20} color={colors.brand} />
            <Text style={styles.dateText}>{dateDisplay}</Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={colors.muted} />
          </Pressable>
        )}
        {showPicker && Platform.OS !== "web" && (
          <DateTimePicker
            value={new Date(date + "T00:00:00")}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, d) => {
              setShowPicker(Platform.OS === "ios");
              if (d) setDate(toISO(d));
            }}
          />
        )}

        {/* Note */}
        <View style={{ marginTop: spacing.lg }}>
          <Input
            testID="txn-note-input"
            label={t("transactionForm.noteLabel")}
            icon="note-text"
            placeholder={t("transactionForm.notePlaceholder")}
            value={note}
            onChangeText={setNote}
          />
        </View>

        {editing && (
          <Pressable testID="delete-txn-button" style={styles.deleteBtn} onPress={doDelete}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
            <Text style={styles.deleteText}>
              {confirmDelete ? t("transactionForm.confirmDelete") : t("transactionForm.deleteButton")}
            </Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            testID="save-transaction-button"
            title={editing ? t("transactionForm.saveChanges") : t("transactionForm.saveNew")}
            onPress={save}
            loading={saving}
          />
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

  label: {
    fontFamily: font.semibold,
    fontSize: fontSize.base,
    color: colors.onSurface,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
  catRow: { gap: spacing.sm, paddingBottom: spacing.xs, paddingRight: spacing.lg },
  catChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    flexShrink: 0,
  },
  catChipText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.muted },

  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surfaceSecondary, ...shadow.soft },
  segmentText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.muted },
  segmentTextActive: { color: colors.brand },

  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    minHeight: 54,
  },
  dateText: { flex: 1, fontFamily: font.semibold, fontSize: fontSize.base, color: colors.onSurface },

  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#FEE2E2",
  },
  deleteText: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.error },

  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
