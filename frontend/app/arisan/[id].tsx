import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  ActivityIndicator,
  Share,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api, ApiError } from "@/src/lib/api";
import { useAuth } from "@/src/context/AuthContext";
import { useToast } from "@/src/context/ToastContext";
import { useLanguage } from "@/src/context/LanguageContext";
import { Button, Input } from "@/src/components/ui";
import { colors, font, fontSize, radius, spacing, shadow, formatRupiah } from "@/src/theme";

interface Participant {
  user_id: string | null;
  name: string;
  order: number;
  has_won: boolean;
  paid_this_period: boolean;
}

interface ArisanDetail {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  contribution_amount: number;
  cycle: "weekly" | "monthly";
  participants: Participant[];
  current_turn: number;
  current_period: string;
}

function initials(name?: string) {
  return (name || "A")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ArisanDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ id: string }>();
  const aid = params.id as string;

  const [arisan, setArisan] = useState<ArisanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState(false);
  const [confirmDraw, setConfirmDraw] = useState(false);
  const [addModal, setAddModal] = useState(false);
  const [participantName, setParticipantName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isOwner = arisan?.owner_id === user?.user_id;

  const load = useCallback(async () => {
    try {
      const res: any = await api.getArisan(aid);
      setArisan(res.arisan);
    } catch {
      toast.show(t("arisanDetail.errLoad"), "error");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [aid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const shareCode = async () => {
    if (!arisan) return;
    try {
      await Share.share({
        message: t("arisanDetail.shareMessage", { name: arisan.name, code: arisan.invite_code }),
      });
    } catch {}
  };

  const toggleContribute = async (p: Participant) => {
    if (!arisan || !p.user_id) return;
    const isSelf = p.user_id === user?.user_id;
    if (!isSelf && !isOwner) {
      toast.show(t("arisanDetail.onlyCoordinator"), "info");
      return;
    }
    setArisan((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        participants: prev.participants.map((x) =>
          x.user_id === p.user_id ? { ...x, paid_this_period: !x.paid_this_period } : x,
        ),
      };
    });
    try {
      await api.contributeArisan(aid, {
        period: arisan.current_period,
        user_id: p.user_id,
        paid: !p.paid_this_period,
      });
      load();
    } catch {
      toast.show(t("arisanDetail.errSaveStatus"), "error");
      load();
    }
  };

  const submitAddParticipant = async () => {
    if (!participantName.trim()) return;
    setSubmitting(true);
    try {
      await api.addArisanParticipant(aid, participantName.trim());
      setAddModal(false);
      setParticipantName("");
      toast.show(t("arisanDetail.addedParticipant"), "success");
      load();
    } catch {
      toast.show(t("arisanDetail.errAddParticipant"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  const draw = async () => {
    if (!confirmDraw) {
      setConfirmDraw(true);
      setTimeout(() => setConfirmDraw(false), 3000);
      return;
    }
    setConfirmDraw(false);
    try {
      const res: any = await api.drawArisan(aid);
      toast.show(t("arisanDetail.drawnToast", { name: res.winner.name }), "success");
      load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        toast.show(t("arisanDetail.allWonNotice"), "info");
      } else {
        toast.show(t("arisanDetail.errDraw"), "error");
      }
    }
  };

  const leaveOrDelete = async () => {
    if (!arisan) return;
    if (!confirmAction) {
      setConfirmAction(true);
      setTimeout(() => setConfirmAction(false), 3000);
      return;
    }
    try {
      if (isOwner) {
        await api.deleteArisan(aid);
        toast.show(t("arisanDetail.arisanDeleted"), "info");
      } else {
        await api.leaveArisan(aid);
        toast.show(t("arisanDetail.leftArisan"), "info");
      }
      router.back();
    } catch {
      toast.show(t("arisanDetail.errGeneric"), "error");
    }
  };

  if (loading || !arisan) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }

  const sortedParticipants = [...arisan.participants].sort((a, b) => a.order - b.order);
  const allWon = sortedParticipants.every((p) => p.has_won);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="back-button" onPress={() => router.back()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {arisan.name}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Invite code */}
        <View style={styles.inviteCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inviteLabel}>{t("arisanDetail.inviteLabel")}</Text>
            <Text testID="invite-code" style={styles.inviteCode}>
              {arisan.invite_code}
            </Text>
          </View>
          <Pressable testID="share-code-button" style={styles.shareBtn} onPress={shareCode}>
            <MaterialCommunityIcons name="share-variant" size={18} color={colors.onBrandPrimary} />
            <Text style={styles.shareText}>{t("arisanDetail.shareButton")}</Text>
          </Pressable>
        </View>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t("arisanDetail.contributionLabel")}</Text>
            <Text style={styles.summaryValue}>{formatRupiah(arisan.contribution_amount)}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{t("arisanDetail.cycleLabel")}</Text>
            <Text style={[styles.summaryValue, { color: colors.brand }]}>
              {t(`cycles.${arisan.cycle}`)}
            </Text>
          </View>
        </View>

        {/* Members */}
        <View style={styles.membersHeader}>
          <Text style={styles.sectionLabel}>
            {t("arisanDetail.membersSection", { count: sortedParticipants.length })}
          </Text>
          {isOwner && (
            <Pressable
              testID="add-participant-button"
              style={styles.addBtn}
              onPress={() => {
                setParticipantName("");
                setAddModal(true);
              }}
            >
              <MaterialCommunityIcons name="account-plus" size={16} color={colors.onBrandPrimary} />
              <Text style={styles.addBtnText}>{t("arisanDetail.addParticipantButton")}</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.card}>
          {sortedParticipants.map((p, i) => {
            const canToggle = !!p.user_id && (p.user_id === user?.user_id || isOwner);
            return (
              <View key={`${p.user_id ?? "offline"}-${p.order}`}>
                {i > 0 && <View style={styles.divider} />}
                <Pressable
                  testID={`participant-${p.order}`}
                  style={styles.memberRow}
                  onPress={() => toggleContribute(p)}
                  disabled={!canToggle}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(p.name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {p.name}
                      {p.user_id === user?.user_id ? t("arisanDetail.you") : ""}
                    </Text>
                    <Text
                      style={[styles.memberStatus, p.paid_this_period && styles.memberStatusPaid]}
                    >
                      {p.paid_this_period
                        ? t("arisanDetail.paidThisPeriod")
                        : t("arisanDetail.notPaidYet")}
                    </Text>
                  </View>
                  {p.has_won && (
                    <View style={styles.wonPill}>
                      <MaterialCommunityIcons name="trophy" size={12} color="#92400E" />
                      <Text style={styles.wonPillText}>{t("arisanDetail.hasWon")}</Text>
                    </View>
                  )}
                  {p.user_id === arisan.owner_id && (
                    <View style={styles.ownerPill}>
                      <Text style={styles.ownerPillText}>{t("arisanDetail.coordinator")}</Text>
                    </View>
                  )}
                  {canToggle && (
                    <MaterialCommunityIcons
                      name={p.paid_this_period ? "check-circle" : "circle-outline"}
                      size={22}
                      color={p.paid_this_period ? colors.success : colors.borderStrong}
                    />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Draw */}
        {isOwner && allWon && (
          <View style={styles.allWonCard}>
            <MaterialCommunityIcons name="trophy-variant" size={20} color={colors.brand} />
            <Text style={styles.allWonText}>{t("arisanDetail.allWonNotice")}</Text>
          </View>
        )}
        {isOwner && !allWon && (
          <Pressable testID="draw-button" style={styles.drawBtn} onPress={draw}>
            <MaterialCommunityIcons name="dice-multiple" size={20} color={colors.onBrandPrimary} />
            <Text style={styles.drawBtnText}>
              {confirmDraw ? t("arisanDetail.drawConfirm") : t("arisanDetail.drawButton")}
            </Text>
          </Pressable>
        )}

        {/* Leave / delete */}
        <Pressable testID="leave-delete-button" style={styles.dangerBtn} onPress={leaveOrDelete}>
          <MaterialCommunityIcons
            name={isOwner ? "trash-can-outline" : "exit-to-app"}
            size={20}
            color={colors.error}
          />
          <Text style={styles.dangerText}>
            {confirmAction
              ? t("arisanDetail.confirmAgain")
              : isOwner
                ? t("arisanDetail.deleteArisan")
                : t("arisanDetail.leaveArisan")}
          </Text>
        </Pressable>
      </ScrollView>

      {/* Add participant modal */}
      <Modal
        visible={addModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModal(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setAddModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>{t("arisanDetail.addParticipantTitle")}</Text>
            <Text style={styles.modalSub}>{t("arisanDetail.addParticipantSub")}</Text>
            <Input
              testID="participant-name-input"
              icon="account-plus"
              placeholder={t("arisanDetail.addParticipantPlaceholder")}
              value={participantName}
              onChangeText={setParticipantName}
              autoFocus
            />
            <Button
              testID="add-participant-submit"
              title={t("arisanDetail.addParticipantSubmit")}
              onPress={submitAddParticipant}
              loading={submitting}
              style={{ marginTop: spacing.lg }}
            />
            <Pressable style={styles.cancelBtn} onPress={() => setAddModal(false)}>
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
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: font.bold,
    fontSize: fontSize.lg,
    color: colors.onSurface,
  },

  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceInverse,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.card,
  },
  inviteLabel: { fontFamily: font.medium, fontSize: fontSize.sm, color: "rgba(255,255,255,0.7)" },
  inviteCode: {
    fontFamily: font.extrabold,
    fontSize: 28,
    color: colors.onSurfaceInverse,
    letterSpacing: 4,
    marginTop: 2,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.lg,
    height: 44,
    borderRadius: radius.pill,
  },
  shareText: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onBrandPrimary },

  summaryRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadow.soft,
  },
  summaryLabel: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted },
  summaryValue: { fontFamily: font.extrabold, fontSize: fontSize.xl, color: colors.onSurface, marginTop: 2 },

  membersHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionLabel: { fontFamily: font.bold, fontSize: fontSize.lg, color: colors.onSurface },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.brand,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
  },
  addBtnText: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.onBrandPrimary },

  card: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    ...shadow.soft,
    overflow: "hidden",
  },
  memberRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: font.bold, fontSize: fontSize.sm, color: colors.onBrandSecondary },
  memberName: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.onSurface },
  memberStatus: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.muted, marginTop: 1 },
  memberStatusPaid: { color: colors.success },
  wonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  wonPillText: { fontFamily: font.semibold, fontSize: 10, color: "#92400E" },
  ownerPill: {
    backgroundColor: colors.brandSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  ownerPillText: { fontFamily: font.semibold, fontSize: 10, color: colors.onBrandSecondary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 62 },

  drawBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
  },
  drawBtnText: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.onBrandPrimary },
  allWonCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  allWonText: { flex: 1, fontFamily: font.semibold, fontSize: fontSize.base, color: colors.onBrandTertiary },

  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing["2xl"],
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "#FEE2E2",
  },
  dangerText: { fontFamily: font.bold, fontSize: fontSize.base, color: colors.error },

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
  cancelBtn: { alignItems: "center", paddingVertical: spacing.md, marginTop: spacing.sm },
  cancelText: { fontFamily: font.semibold, fontSize: fontSize.base, color: colors.muted },
});
