import React, { useCallback, useContext, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, ApiError } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useUpgrade } from "@/src/context/UpgradeContext";
import { useToast } from "@/src/context/ToastContext";
import { useLanguage } from "@/src/context/LanguageContext";
import { EmptyState, Button, Input } from "@/src/components/ui";
import { colors, font, fontSize, radius, spacing, shadow, formatRupiah, webMaxWidth } from "@/src/theme";

interface ArisanParticipant {
  user_id: string | null;
  name: string;
  order: number;
  has_won: boolean;
}

interface ArisanItem {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  contribution_amount: number;
  cycle: "weekly" | "monthly";
  participants: ArisanParticipant[];
  current_turn: number;
}

export default function Arisan() {
  const insets = useSafeAreaInsets();
  const tabH = useContext(BottomTabBarHeightContext) ?? 64 + insets.bottom;
  const router = useRouter();
  const { user } = useAuth();
  const { showUpgrade } = useUpgrade();
  const toast = useToast();
  const { t } = useLanguage();

  const [items, setItems] = useState<ArisanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | "join">(null);
  const [nameInput, setNameInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [cycle, setCycle] = useState<"weekly" | "monthly">("monthly");
  const [codeInput, setCodeInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res: any = await api.listArisan();
      setItems(res.arisan);
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

  const onCreate = () => {
    if (user?.plan !== "premium") {
      showUpgrade();
      return;
    }
    setNameInput("");
    setAmountInput("");
    setCycle("monthly");
    setModal("create");
  };

  const submitCreate = async () => {
    if (!nameInput.trim()) {
      toast.show(t("arisan.errNameRequired"), "error");
      return;
    }
    const amount = Number(amountInput.replace(/[^0-9]/g, ""));
    if (!amount || amount <= 0) {
      toast.show(t("arisan.errAmountRequired"), "error");
      return;
    }
    setSubmitting(true);
    try {
      const res: any = await api.createArisan({
        name: nameInput.trim(),
        contribution_amount: amount,
        cycle,
      });
      setModal(null);
      toast.show(t("arisan.createdToast"), "success");
      await load();
      router.push({ pathname: "/arisan/[id]", params: { id: res.arisan.id } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setModal(null);
        setTimeout(showUpgrade, 300);
      } else {
        toast.show(t("arisan.errCreate"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitJoin = async () => {
    if (!codeInput.trim()) {
      toast.show(t("arisan.errCodeRequired"), "error");
      return;
    }
    setSubmitting(true);
    try {
      const res: any = await api.joinArisan(codeInput.trim());
      setModal(null);
      toast.show(t("arisan.joinedToast", { name: res.name }), "success");
      setCodeInput("");
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        toast.show(t("arisan.errCodeNotFound"), "error");
      } else if (e instanceof ApiError && e.status === 409) {
        toast.show(t("arisan.errAlreadyMember"), "info");
      } else {
        toast.show(t("arisan.errJoin"), "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top + spacing.xl }}>
        <Text style={styles.title}>{t("arisan.title")}</Text>
        <View style={styles.actionRow}>
          <Pressable testID="create-arisan-button" style={styles.actionBtn} onPress={onCreate}>
            <View style={styles.actionIcon}>
              <MaterialCommunityIcons name="plus-circle" size={22} color={colors.brand} />
            </View>
            <Text style={styles.actionText}>{t("arisan.createButton")}</Text>
            {user?.plan !== "premium" && (
              <View style={styles.lockPill}>
                <MaterialCommunityIcons name="crown" size={10} color="#B45309" />
              </View>
            )}
          </Pressable>
          <Pressable
            testID="join-arisan-button"
            style={styles.actionBtn}
            onPress={() => {
              setCodeInput("");
              setModal("join");
            }}
          >
            <View style={styles.actionIcon}>
              <MaterialCommunityIcons name="ticket-confirmation" size={22} color={colors.brand} />
            </View>
            <Text style={styles.actionText}>{t("arisan.joinButton")}</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.xl,
            paddingTop: spacing.lg,
            paddingBottom: tabH + spacing.xl,
            width: "100%",
            maxWidth: webMaxWidth,
            alignSelf: "center",
          }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          renderItem={({ item }) => {
            const isOwner = item.owner_id === user?.user_id;
            return (
              <Pressable
                testID={`arisan-card-${item.id}`}
                onPress={() => router.push({ pathname: "/arisan/[id]", params: { id: item.id } })}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.icon}>
                  <MaterialCommunityIcons name="sync-circle" size={26} color={colors.brand} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {isOwner && (
                      <View style={styles.ownerPill}>
                        <MaterialCommunityIcons name="crown" size={12} color="#92400E" />
                        <Text style={styles.ownerPillText}>{t("arisan.coordinator")}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.meta}>
                    {t("arisan.meta", {
                      count: item.participants.length,
                      cycle: t(`cycles.${item.cycle}`),
                    })}
                  </Text>
                  <Text style={styles.amount}>{formatRupiah(item.contribution_amount)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={22} color={colors.borderStrong} />
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              icon="sync-circle"
              title={t("arisan.emptyTitle")}
              subtitle={t("arisan.emptySubtitle")}
            />
          }
        />
      )}

      {/* Create / Join modal */}
      <Modal
        visible={modal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setModal(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {modal === "create" ? t("arisan.modalCreateTitle") : t("arisan.modalJoinTitle")}
            </Text>
            <Text style={styles.modalSub}>
              {modal === "create" ? t("arisan.modalCreateSub") : t("arisan.modalJoinSub")}
            </Text>
            {modal === "create" ? (
              <View style={{ gap: spacing.md }}>
                <Input
                  testID="arisan-name-input"
                  icon="sync-circle"
                  placeholder={t("arisan.namePlaceholder")}
                  value={nameInput}
                  onChangeText={setNameInput}
                  autoFocus
                />
                <Input
                  testID="arisan-amount-input"
                  icon="cash"
                  placeholder={t("arisan.amountLabel")}
                  value={amountInput}
                  onChangeText={setAmountInput}
                  keyboardType="numeric"
                />
                <View style={styles.cycleRow}>
                  {(["monthly", "weekly"] as const).map((c) => (
                    <Pressable
                      key={c}
                      testID={`arisan-cycle-${c}`}
                      style={[styles.cyclePill, cycle === c && styles.cyclePillActive]}
                      onPress={() => setCycle(c)}
                    >
                      <Text style={[styles.cyclePillText, cycle === c && styles.cyclePillTextActive]}>
                        {t(`cycles.${c}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <Input
                testID="arisan-code-input"
                icon="ticket-confirmation"
                placeholder={t("arisan.codePlaceholder")}
                value={codeInput}
                onChangeText={(val) => setCodeInput(val.toUpperCase())}
                autoCapitalize="characters"
                autoFocus
              />
            )}
            <Button
              testID="modal-submit-button"
              title={modal === "create" ? t("arisan.submitCreate") : t("arisan.submitJoin")}
              onPress={modal === "create" ? submitCreate : submitJoin}
              loading={submitting}
              style={{ marginTop: spacing.lg }}
            />
            <Pressable style={styles.cancelBtn} onPress={() => setModal(null)}>
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
  title: {
    fontFamily: font.extrabold,
    fontSize: fontSize["2xl"],
    color: colors.onSurface,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    width: "100%",
    maxWidth: webMaxWidth,
    alignSelf: "center",
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    width: "100%",
    maxWidth: webMaxWidth,
    alignSelf: "center",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.soft,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: { flex: 1, fontFamily: font.bold, fontSize: fontSize.base, color: colors.onSurface },
  lockPill: {
    backgroundColor: "#FEF3C7",
    padding: 4,
    borderRadius: radius.pill,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  icon: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.brandTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface, flexShrink: 1 },
  ownerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  ownerPillText: { fontFamily: font.extrabold, fontSize: 12, color: "#92400E" },
  meta: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted },
  amount: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.brand },

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
  modalSub: {
    fontFamily: font.regular,
    fontSize: fontSize.base,
    color: colors.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  cycleRow: { flexDirection: "row", gap: spacing.sm },
  cyclePill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary,
  },
  cyclePillActive: { backgroundColor: colors.brand },
  cyclePillText: { fontFamily: font.semibold, fontSize: fontSize.sm, color: colors.onSurfaceTertiary },
  cyclePillTextActive: { color: colors.onBrandPrimary },
  cancelBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.muted },
});
