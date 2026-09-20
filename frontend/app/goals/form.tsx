import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, Pressable, ScrollView, Platform, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Input, Button } from "@/src/components/ui";
import { api, ApiError } from "@/src/lib/api";
import { useToast } from "@/src/context/ToastContext";
import { useUpgrade } from "@/src/context/UpgradeContext";
import { useLanguage } from "@/src/context/LanguageContext";
import { colors, font, fontSize, radius, spacing, formatRupiah } from "@/src/theme";

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

interface YearlyObligation {
  id: string;
  name: string;
  price: number;
  billing_cycle: string;
  next_due_date: string;
}

export default function GoalForm() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { showUpgrade } = useUpgrade();
  const { t, locale } = useLanguage();
  const params = useLocalSearchParams<{ id?: string }>();
  const editing = !!params.id;

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [kind, setKind] = useState<"goal" | "annual_fund">("goal");
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadline, setDeadline] = useState(() => toISO(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [linkedObligationId, setLinkedObligationId] = useState<string | null>(null);
  const [yearlyObligations, setYearlyObligations] = useState<YearlyObligation[]>([]);

  useEffect(() => {
    api
      .listSubs()
      .then((res: any) => {
        const yearly = (res.obligations || []).filter((o: any) => o.billing_cycle === "yearly");
        setYearlyObligations(yearly);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    (async () => {
      try {
        const res: any = await api.getGoal(params.id as string);
        const g = res.goal;
        setName(g.name);
        setTargetAmount(String(g.target_amount ?? ""));
        setKind(g.kind || "goal");
        if (g.deadline) {
          setHasDeadline(true);
          setDeadline(g.deadline);
        }
        setLinkedObligationId(g.linked_obligation_id || null);
      } catch {
        toast.show(t("goalForm.errLoad"), "error");
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [editing, params.id]);

  const pickAnnualFundObligation = (o: YearlyObligation) => {
    setLinkedObligationId(o.id);
    if (!name.trim()) setName(o.name);
    if (!targetAmount) setTargetAmount(String(o.price));
    setHasDeadline(true);
    setDeadline(o.next_due_date);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.show(t("goalForm.errNameRequired"), "error");
      return;
    }
    const targetNum = parseFloat(targetAmount.replace(/[^0-9.]/g, "")) || 0;
    if (targetNum <= 0) {
      toast.show(t("goalForm.errTargetRequired"), "error");
      return;
    }
    if (kind === "annual_fund" && !linkedObligationId) {
      toast.show(t("goalForm.errAnnualFundLinkRequired"), "error");
      return;
    }
    const body = {
      name: name.trim(),
      target_amount: targetNum,
      deadline: hasDeadline ? deadline : null,
      kind,
      linked_obligation_id: kind === "annual_fund" ? linkedObligationId : null,
    };
    setSaving(true);
    try {
      if (editing) {
        await api.updateGoal(params.id as string, body);
      } else {
        await api.createGoal(body);
      }
      toast.show(editing ? t("goalForm.updated") : t("goalForm.created"), "success");
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        router.back();
        setTimeout(showUpgrade, 350);
        return;
      }
      if (e instanceof ApiError && (e.status === 422 || e.status === 404)) {
        toast.show(e.message, "error");
        return;
      }
      toast.show(t("goalForm.errSave"), "error");
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
      await api.deleteGoal(params.id as string);
      toast.show(t("goalForm.deleted"), "info");
      router.back();
    } catch {
      toast.show(t("goalForm.errDelete"), "error");
    }
  };

  const deadlineDisplay = (() => {
    const d = new Date(deadline + "T00:00:00");
    if (isNaN(d.getTime())) return deadline;
    return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
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
        <Pressable testID="close-goal-form" onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="close" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {editing ? t("goalForm.editTitle") : t("goalForm.createTitle")}
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
        <Text style={styles.label}>{t("goalForm.kindLabel")}</Text>
        <View style={styles.segment}>
          {(["goal", "annual_fund"] as const).map((k) => {
            const active = kind === k;
            return (
              <Pressable
                key={k}
                testID={`goal-kind-${k}`}
                onPress={() => {
                  setKind(k);
                  if (k === "goal") setLinkedObligationId(null);
                }}
                style={[styles.segmentItem, active && styles.segmentActive]}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t(`goalForm.kind_${k}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {kind === "annual_fund" && (
          <View style={{ marginTop: spacing.md }}>
            <Text style={styles.hint}>{t("goalForm.annualFundHint")}</Text>
            {yearlyObligations.length === 0 ? (
              <View style={styles.emptyLinkBox}>
                <MaterialCommunityIcons name="calendar-alert" size={18} color={colors.muted} />
                <Text style={styles.emptyLinkText}>{t("goalForm.noYearlyObligations")}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.obligationRow}>
                {yearlyObligations.map((o) => {
                  const active = linkedObligationId === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      testID={`obligation-pick-${o.id}`}
                      onPress={() => pickAnnualFundObligation(o)}
                      style={[styles.obligationChip, active && styles.obligationChipActive]}
                    >
                      <Text style={[styles.obligationChipText, active && styles.obligationChipTextActive]}>
                        {o.name}
                      </Text>
                      <Text style={[styles.obligationChipSub, active && styles.obligationChipTextActive]}>
                        {formatRupiah(o.price)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}

        <View style={{ marginTop: spacing.lg }}>
          <Input
            testID="goal-name-input"
            label={t("goalForm.nameLabel")}
            icon="tag"
            placeholder={t("goalForm.namePlaceholder")}
            value={name}
            onChangeText={setName}
          />
        </View>

        <Input
          testID="goal-target-input"
          label={t("goalForm.targetLabel")}
          icon="cash"
          placeholder="0"
          value={targetAmount}
          onChangeText={setTargetAmount}
          keyboardType="numeric"
        />

        <View style={styles.deadlineHeaderRow}>
          <Text style={styles.label}>{t("goalForm.deadlineLabel")}</Text>
          <Pressable testID="toggle-deadline" onPress={() => setHasDeadline((v) => !v)}>
            <Text style={styles.deadlineToggle}>
              {hasDeadline ? t("goalForm.deadlineRemove") : t("goalForm.deadlineAdd")}
            </Text>
          </Pressable>
        </View>
        {hasDeadline &&
          (Platform.OS === "web" ? (
            <View style={styles.dateBox}>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.brand} />
              <input
                data-testid="goal-deadline-input"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                style={webDateInputStyle}
              />
            </View>
          ) : (
            <Pressable testID="goal-deadline-button" style={styles.dateBox} onPress={() => setShowPicker(true)}>
              <MaterialCommunityIcons name="calendar" size={20} color={colors.brand} />
              <Text style={styles.dateText}>{deadlineDisplay}</Text>
              <MaterialCommunityIcons name="chevron-down" size={20} color={colors.muted} />
            </Pressable>
          ))}
        {showPicker && Platform.OS !== "web" && (
          <DateTimePicker
            value={new Date(deadline + "T00:00:00")}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={(event, date) => {
              setShowPicker(Platform.OS === "ios");
              if (date) setDeadline(toISO(date));
            }}
          />
        )}

        {editing && (
          <Pressable testID="delete-goal-button" style={styles.deleteBtn} onPress={doDelete}>
            <MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} />
            <Text style={styles.deleteText}>
              {confirmDelete ? t("goalForm.confirmDelete") : t("goalForm.deleteButton")}
            </Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            testID="save-goal-button"
            title={editing ? t("goalForm.saveChanges") : t("goalForm.saveNew")}
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
    marginTop: spacing.xs,
  },
  hint: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.muted, marginBottom: spacing.sm },

  segment: {
    flexDirection: "row",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segmentItem: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center" },
  segmentActive: { backgroundColor: colors.surfaceSecondary },
  segmentText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.muted },
  segmentTextActive: { color: colors.brand },

  obligationRow: { gap: spacing.sm, paddingRight: spacing.lg },
  obligationChip: {
    minWidth: 130,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  obligationChipActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  obligationChipText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.onSurface },
  obligationChipSub: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  obligationChipTextActive: { color: colors.brand },

  emptyLinkBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceTertiary,
  },
  emptyLinkText: { flex: 1, fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted },

  deadlineHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.lg,
  },
  deadlineToggle: { fontFamily: font.semibold, fontSize: fontSize.sm, color: colors.brand },
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
