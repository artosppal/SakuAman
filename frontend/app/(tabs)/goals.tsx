import React, { useCallback, useContext, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Platform,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { BlurView } from "expo-blur";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, ApiError } from "@/src/lib/api";
import { useLanguage } from "@/src/context/LanguageContext";
import { useToast } from "@/src/context/ToastContext";
import { EmptyState, Input, Button } from "@/src/components/ui";
import { colors, font, fontSize, radius, spacing, shadow, webMaxWidth, formatRupiah } from "@/src/theme";

interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  kind: "goal" | "annual_fund";
  linked_obligation_id: string | null;
  progress_pct: number;
  suggested_monthly_deposit: number | null;
}

export default function Goals() {
  const insets = useSafeAreaInsets();
  const tabH = useContext(BottomTabBarHeightContext) ?? 64 + insets.bottom;
  const router = useRouter();
  const { t, locale } = useLanguage();
  const toast = useToast();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [depositGoal, setDepositGoal] = useState<Goal | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await api.listGoals();
      setGoals(res.goals || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const headerHeight = insets.top + 70;

  const onAdd = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push("/goals/form");
  };

  const openDeposit = (g: Goal) => {
    setDepositAmount("");
    setDepositGoal(g);
  };

  const submitDeposit = async () => {
    if (!depositGoal) return;
    const amountNum = parseFloat(depositAmount.replace(/[^0-9.]/g, "")) || 0;
    if (amountNum <= 0) {
      toast.show(t("goals.depositErrAmount"), "error");
      return;
    }
    setDepositing(true);
    try {
      await api.depositToGoal(depositGoal.id, { amount: amountNum });
      toast.show(t("goals.depositSuccess"), "success");
      setDepositGoal(null);
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        toast.show(e.message, "error");
        return;
      }
      toast.show(t("goals.depositErrSave"), "error");
    } finally {
      setDepositing(false);
    }
  };

  const deadlineLabel = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    if (isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
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
          <Text style={styles.title}>{t("goals.title")}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={goals}
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
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => {
            const pct = Math.min(100, item.progress_pct);
            const isAnnualFund = item.kind === "annual_fund";
            return (
              <Pressable
                testID={`goal-card-${item.id}`}
                onPress={() => router.push({ pathname: "/goals/form", params: { id: item.id } })}
                style={styles.goalCard}
              >
                <View style={styles.goalTopRow}>
                  <View style={styles.goalIcon}>
                    <MaterialCommunityIcons
                      name={isAnnualFund ? "calendar-sync" : "piggy-bank"}
                      size={20}
                      color={colors.brand}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.goalName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.deadline && (
                      <Text style={styles.goalDeadline}>
                        {t("goals.deadlineLabel", { date: deadlineLabel(item.deadline) })}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    testID={`goal-deposit-${item.id}`}
                    onPress={(e: any) => {
                      e.stopPropagation?.();
                      openDeposit(item);
                    }}
                    style={styles.depositBtn}
                  >
                    <MaterialCommunityIcons name="plus" size={16} color={colors.onBrandPrimary} />
                    <Text style={styles.depositBtnText}>{t("goals.depositAction")}</Text>
                  </Pressable>
                </View>

                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct}%` }]} />
                </View>
                <View style={styles.goalAmountRow}>
                  <Text style={styles.goalAmount}>
                    {formatRupiah(item.current_amount)} / {formatRupiah(item.target_amount)}
                  </Text>
                  <Text style={styles.goalPct}>{Math.round(pct)}%</Text>
                </View>

                {!!item.suggested_monthly_deposit && item.suggested_monthly_deposit > 0 && (
                  <Text style={styles.suggestionText}>
                    {t("goals.suggestedMonthly", { amount: formatRupiah(item.suggested_monthly_deposit) })}
                  </Text>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="piggy-bank-outline"
              title={t("goals.emptyTitle")}
              subtitle={t("goals.emptySubtitle")}
            />
          }
        />
      )}

      <Pressable
        testID="add-goal-fab"
        onPress={onAdd}
        style={({ pressed }) => [
          styles.fab,
          { bottom: tabH + spacing.md },
          pressed && { transform: [{ scale: 0.95 }] },
        ]}
      >
        <MaterialCommunityIcons name="plus" size={28} color={colors.onBrandPrimary} />
      </Pressable>

      <Modal
        visible={!!depositGoal}
        transparent
        animationType="fade"
        onRequestClose={() => setDepositGoal(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setDepositGoal(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("goals.depositTitle")}</Text>
            <Text style={styles.modalSub} numberOfLines={1}>
              {depositGoal?.name}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Input
                testID="deposit-amount-input"
                label={t("goals.depositAmountLabel")}
                icon="cash"
                placeholder="0"
                value={depositAmount}
                onChangeText={setDepositAmount}
                keyboardType="numeric"
                autoFocus
              />
            </View>
            <Button
              testID="submit-deposit-button"
              title={t("goals.depositSubmit")}
              onPress={submitDeposit}
              loading={depositing}
            />
            <Pressable style={styles.cancelBtn} onPress={() => setDepositGoal(null)}>
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
    width: "100%",
    maxWidth: webMaxWidth,
    alignSelf: "center",
  },
  title: { fontFamily: font.extrabold, fontSize: fontSize["2xl"], color: colors.onSurface },

  goalCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.soft,
  },
  goalTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  goalIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  goalName: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  goalDeadline: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted, marginTop: 2 },
  depositBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  depositBtnText: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.onBrandPrimary },

  barTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.brand },
  goalAmountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  goalAmount: { fontFamily: font.semibold, fontSize: fontSize.sm, color: colors.onSurface },
  goalPct: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.brand },
  suggestionText: {
    fontFamily: font.medium,
    fontSize: fontSize.sm,
    color: colors.muted,
    marginTop: spacing.sm,
  },

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

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(24,41,36,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  modalCard: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.xl,
  },
  modalTitle: { fontFamily: font.extrabold, fontSize: fontSize.xl, color: colors.onSurface },
  modalSub: { fontFamily: font.medium, fontSize: fontSize.base, color: colors.muted, marginTop: spacing.xs },
  cancelBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.muted },
});
