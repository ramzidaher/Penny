import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  ScrollView,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrencySymbol } from '../utils/currency';
import type { ReceiptLineItem } from '../types/receipt';
import { typography } from '../theme/typography';
import { Ionicons } from '@expo/vector-icons';
import { AVATAR_SEEDS, getAvatarDisplayName } from '../utils/avatarUtils';
import Avatar from './Avatar';

/** Optional sound hooks for claim/reveal; no-op when sound off or no assets. */
function useSplitSound() {
  const playClaim = useCallback(() => {
    // TODO: getSettings().enableSound && play claim sound (e.g. expo-av)
  }, []);
  const playReveal = useCallback(() => {
    // TODO: getSettings().enableSound && play reveal sound
  }, []);
  return { playClaim, playReveal };
}

/** Pick N random avatar seeds from profile set (same as signup/change avatar). */
function pickRandomAvatarSeeds(count: number): string[] {
  const shuffled = shuffle([...AVATAR_SEEDS]);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

type SplitStep = 'setup' | 'lobby' | 'game' | 'leaderboard';

export interface TotalsByAvatarSeed {
  total: number;
  count: number;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function computeTotalsByAvatarSeed(
  seeds: string[],
  claimedBy: Record<string, string[]>,
  items: ReceiptLineItem[]
): Record<string, TotalsByAvatarSeed> {
  const out: Record<string, TotalsByAvatarSeed> = {};
  seeds.forEach((seed) => {
    out[seed] = { total: 0, count: 0 };
  });
  items.forEach((item) => {
    const assignees = claimedBy[item.id];
    if (assignees && assignees.length > 0) {
      const share = item.amount / assignees.length;
      assignees.forEach((seed) => {
        if (out[seed]) {
          out[seed].total += share;
          out[seed].count += 1;
        }
      });
    }
  });
  return out;
}

interface ReceiptSplitFlowProps {
  items: ReceiptLineItem[];
  currency: string;
  onClose: () => void;
}

const NEXT_ITEM_DELAY_MS = 1000;

export default function ReceiptSplitFlow({ items, currency, onClose }: ReceiptSplitFlowProps) {
  const { colors: themeColors } = useTheme();
  const styles = useMemo(() => createStyles(themeColors), [themeColors]);
  const symbol = getCurrencySymbol(currency);
  const { playClaim, playReveal } = useSplitSound();

  const [step, setStep] = useState<SplitStep>('setup');
  const [playerCount, setPlayerCount] = useState(2);
  const [lobbyPlayerSeeds, setLobbyPlayerSeeds] = useState<string[]>([]);
  const [claimedAvatarSeeds, setClaimedAvatarSeeds] = useState<string[]>([]);
  const [myAvatarSeed, setMyAvatarSeed] = useState<string | null>(null);
  const [remainingIds, setRemainingIds] = useState<string[]>([]);
  const [claimedBy, setClaimedBy] = useState<Record<string, string[]>>({});
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [selectedSeedsForCurrent, setSelectedSeedsForCurrent] = useState<string[]>([]);
  const [lastClaimedSeed, setLastClaimedSeed] = useState<string | null>(null);
  const [showWhoHadModal, setShowWhoHadModal] = useState(false);

  const itemsById = useRef<Map<string, ReceiptLineItem>>(new Map());
  items.forEach((it) => itemsById.current.set(it.id, it));
  const totalItems = items.length;
  const receiptTotal = useMemo(() => items.reduce((s, i) => s + i.amount, 0), [items]);

  const goToLobby = useCallback(() => {
    const seeds = pickRandomAvatarSeeds(playerCount);
    setLobbyPlayerSeeds(seeds);
    setClaimedAvatarSeeds([]);
    setMyAvatarSeed(null);
    setStep('lobby');
  }, [playerCount]);

  useEffect(() => {
    if (step === 'lobby' && lobbyPlayerSeeds.length === 0 && playerCount > 0) {
      setLobbyPlayerSeeds(pickRandomAvatarSeeds(playerCount));
    }
  }, [step, lobbyPlayerSeeds.length, playerCount]);

  const claimAvatarInLobby = useCallback(
    (seed: string) => {
      if (claimedAvatarSeeds.includes(seed)) return;
      if (claimedAvatarSeeds.length >= playerCount) return;
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } catch (_) {}
      setClaimedAvatarSeeds((prev) => [...prev, seed]);
      if (myAvatarSeed === null) setMyAvatarSeed(seed);
    },
    [claimedAvatarSeeds, playerCount, myAvatarSeed]
  );

  const startGame = useCallback(() => {
    const shuffled = shuffle(items.map((i) => i.id));
    setRemainingIds(shuffled);
    setClaimedBy({});
    setCurrentItemId(shuffled[0] ?? null);
    setSelectedSeedsForCurrent([]);
    setLastClaimedSeed(null);
    setStep('game');
  }, [items]);

  const advanceToNextItem = useCallback(() => {
    setSelectedSeedsForCurrent([]);
    setRemainingIds((prev) => {
      const next = prev.slice(1);
      if (next.length === 0) return [];
      setTimeout(() => setCurrentItemId(next[0]), NEXT_ITEM_DELAY_MS);
      return next;
    });
  }, []);

  // Transition to leaderboard only after state has committed (avoids last claim showing as unclaimed)
  useEffect(() => {
    if (step === 'game' && remainingIds.length === 0) {
      setStep('leaderboard');
      setCurrentItemId(null);
    }
  }, [step, remainingIds.length]);

  const toggleSelection = useCallback((seed: string) => {
    if (step !== 'game') return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
    setSelectedSeedsForCurrent((prev) =>
      prev.includes(seed) ? prev.filter((s) => s !== seed) : [...prev, seed]
    );
  }, [step]);

  const confirmContinue = useCallback(() => {
    if (step !== 'game' || !currentItemId || selectedSeedsForCurrent.length === 0) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
    setClaimedBy((prev) => ({ ...prev, [currentItemId]: [...selectedSeedsForCurrent] }));
    setLastClaimedSeed(selectedSeedsForCurrent[0]);
    setShowWhoHadModal(false);
    playClaim();
    advanceToNextItem();
  }, [step, currentItemId, selectedSeedsForCurrent, advanceToNextItem, playClaim]);

  const skipCurrentItem = useCallback(() => {
    setShowWhoHadModal(true);
  }, []);

  const skipUnclaimed = useCallback(() => {
    setShowWhoHadModal(false);
    advanceToNextItem();
  }, [advanceToNextItem]);

  const finishGame = useCallback(() => {
    setStep('leaderboard');
    setCurrentItemId(null);
    setShowWhoHadModal(false);
  }, []);

  useEffect(() => {
    if (step === 'leaderboard') playReveal();
  }, [step, playReveal]);

  const playAgain = useCallback(() => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (_) {}
    setStep('setup');
    setLobbyPlayerSeeds([]);
    setClaimedAvatarSeeds([]);
    setMyAvatarSeed(null);
    setRemainingIds([]);
    setClaimedBy({});
    setCurrentItemId(null);
  }, []);

  if (step === 'setup') {
    return (
      <SplitSetupView
        playerCount={playerCount}
        onPlayerCountChange={setPlayerCount}
        onStart={goToLobby}
        onCancel={onClose}
        styles={styles}
      />
    );
  }

  if (step === 'lobby') {
    const seeds = lobbyPlayerSeeds.length ? lobbyPlayerSeeds : pickRandomAvatarSeeds(playerCount);
    const allClaimed = claimedAvatarSeeds.length === playerCount;
    return (
      <SplitLobbyView
        receiptTotal={receiptTotal}
        receiptCount={totalItems}
        playerCount={playerCount}
        symbol={symbol}
        playerSeeds={seeds}
        claimedAvatarSeeds={claimedAvatarSeeds}
        onClaimAvatar={claimAvatarInLobby}
        onStartGame={allClaimed ? startGame : undefined}
        onCancel={onClose}
        styles={styles}
      />
    );
  }

  if (step === 'game') {
    const seeds = lobbyPlayerSeeds.filter((s) => claimedAvatarSeeds.includes(s));
    const currentItem = currentItemId ? itemsById.current.get(currentItemId) : undefined;
    const totalsByAvatarSeed = computeTotalsByAvatarSeed(seeds, claimedBy, items);
    const currentIndex = totalItems - remainingIds.length + 1;
    const nextIds = remainingIds.slice(1, 4);

    return (
      <SplitGameView
        playerSeeds={seeds}
        currentItem={currentItem}
        currentItemIndex={currentIndex}
        totalItems={totalItems}
        nextItemIds={nextIds}
        itemsById={itemsById.current}
        symbol={symbol}
        myAvatarSeed={myAvatarSeed}
        totalsByAvatarSeed={totalsByAvatarSeed}
        selectedSeedsForCurrent={selectedSeedsForCurrent}
        lastClaimedSeed={lastClaimedSeed}
        showWhoHadModal={showWhoHadModal}
        remainingCount={remainingIds.length}
        onToggleSelection={toggleSelection}
        onContinue={confirmContinue}
        onSkip={skipCurrentItem}
        onSkipUnclaimed={skipUnclaimed}
        onFinish={finishGame}
        onClose={onClose}
        styles={styles}
      />
    );
  }

  return (
    <SplitLeaderboardView
      playerCount={playerCount}
      items={items}
      claimedBy={claimedBy}
      playerSeeds={lobbyPlayerSeeds.filter((s) => claimedAvatarSeeds.includes(s))}
      symbol={symbol}
      onDone={onClose}
      styles={styles}
    />
  );
}

interface SplitSetupViewProps {
  playerCount: number;
  onPlayerCountChange: (n: number) => void;
  onStart: () => void;
  onCancel: () => void;
  styles: ReturnType<typeof createStyles>;
}

function SplitSetupView({ playerCount, onPlayerCountChange, onStart, onCancel, styles }: SplitSetupViewProps) {
  return (
    <View style={styles.setupRoot}>
      <Text style={styles.setupTitle}>Split receipt</Text>
      <Text style={styles.setupSubtitle}>How many people? (2–8)</Text>
      <View style={styles.pickerRow}>
        {[2, 3, 4, 5, 6, 7, 8].map((n) => (
          <TouchableOpacity
            key={n}
            style={[styles.pickerButton, playerCount === n && styles.pickerButtonSelected]}
            onPress={() => onPlayerCountChange(n)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pickerButtonText, playerCount === n && styles.pickerButtonTextSelected]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={onStart} activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>Start</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

interface SplitLobbyViewProps {
  receiptTotal: number;
  receiptCount: number;
  playerCount: number;
  symbol: string;
  playerSeeds: string[];
  claimedAvatarSeeds: string[];
  onClaimAvatar: (seed: string) => void;
  onStartGame: (() => void) | undefined;
  onCancel: () => void;
  styles: ReturnType<typeof createStyles>;
}

function SplitLobbyView({
  receiptTotal,
  receiptCount,
  playerCount,
  symbol,
  playerSeeds,
  claimedAvatarSeeds,
  onClaimAvatar,
  onStartGame,
  onCancel,
  styles,
}: SplitLobbyViewProps) {
  const { colors } = useTheme();
  const n = playerSeeds.length;
  const numCols = 2;
  const numRows = Math.ceil(n / numCols);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const { width: screenWidth } = Dimensions.get('window');
  const tileWidth = boardSize.width > 0 ? boardSize.width / numCols : screenWidth / numCols;
  const tileHeight = boardSize.height > 0 ? boardSize.height / numRows : 100;

  const isClaimed = (seed: string) => claimedAvatarSeeds.includes(seed);

  return (
    <View style={styles.lobbyRoot}>
      <Text style={styles.lobbyTitle}>Split receipt</Text>
      <Text style={styles.lobbyReceiptLine}>
        {symbol}
        {receiptTotal.toFixed(2)} • {receiptCount} items
      </Text>
      <Text style={styles.lobbySubtitle}>{playerCount} people splitting – pick your avatar</Text>

      <View style={styles.lobbyBoard} onLayout={(e) => setBoardSize(e.nativeEvent.layout)}>
        {playerSeeds.map((seed, index) => {
          const isLastAndAlone = n % 2 === 1 && index === playerSeeds.length - 1;
          const width = isLastAndAlone ? tileWidth * numCols : tileWidth;
          const claimed = isClaimed(seed);

          return (
            <TouchableOpacity
              key={seed}
              style={[
                styles.lobbyTileAvatar,
                {
                  width,
                  height: tileHeight,
                },
              ]}
              onPress={() => !claimed && onClaimAvatar(seed)}
              activeOpacity={0.85}
              disabled={claimed}
            >
              <Avatar seed={seed} size={56} />
              <Text style={[styles.lobbyTileName, { color: colors.text }]} numberOfLines={1}>
                {getAvatarDisplayName(seed)}
              </Text>
              {claimed && (
                <Text style={[styles.lobbyTileReady, { color: colors.text }]}>
                  Ready <Ionicons name="checkmark-circle" size={16} color={colors.text} />
                </Text>
              )}
              {!claimed && claimedAvatarSeeds.length > 0 && (
                <Text style={styles.lobbyTileHint}>Tap to join</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {onStartGame && (
        <TouchableOpacity style={styles.primaryButton} onPress={onStartGame} activeOpacity={0.8}>
          <Text style={styles.primaryButtonText}>Start</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.8}>
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

interface SplitGameViewProps {
  playerSeeds: string[];
  currentItem: ReceiptLineItem | undefined;
  currentItemIndex: number;
  totalItems: number;
  nextItemIds: string[];
  itemsById: Map<string, ReceiptLineItem>;
  symbol: string;
  myAvatarSeed: string | null;
  totalsByAvatarSeed: Record<string, TotalsByAvatarSeed>;
  selectedSeedsForCurrent: string[];
  lastClaimedSeed: string | null;
  showWhoHadModal: boolean;
  remainingCount: number;
  onToggleSelection: (seed: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onSkipUnclaimed: () => void;
  onFinish: () => void;
  onClose: () => void;
  styles: ReturnType<typeof createStyles>;
}

function SplitGameView({
  playerSeeds,
  currentItem,
  currentItemIndex,
  totalItems,
  nextItemIds,
  itemsById,
  symbol,
  myAvatarSeed,
  totalsByAvatarSeed,
  selectedSeedsForCurrent,
  lastClaimedSeed,
  showWhoHadModal,
  remainingCount,
  onToggleSelection,
  onContinue,
  onSkip,
  onSkipUnclaimed,
  onFinish,
  onClose,
  styles,
}: SplitGameViewProps) {
  const n = playerSeeds.length;
  const numCols = 2;
  const numRows = Math.ceil(n / numCols);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 0 });
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const fallbackHeight = Math.max(0, screenHeight - 260);
  const tileWidth = boardSize.width > 0 ? boardSize.width / numCols : screenWidth / numCols;
  const tileHeight = boardSize.height > 0 ? boardSize.height / numRows : fallbackHeight / numRows;

  const pulseScale = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!myAvatarSeed) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.03,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [myAvatarSeed]);

  useEffect(() => {
    if (!lastClaimedSeed) return;
    flashOpacity.setValue(0);
    Animated.sequence([
      Animated.timing(flashOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.delay(200),
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [lastClaimedSeed]);

  const myTileStyle = { transform: [{ scale: pulseScale }] };
  const flashOpacityStyle = { opacity: flashOpacity };

  return (
    <View style={styles.gameRoot}>
      <View style={styles.gameTop}>
        {currentItem ? (
          <>
            <Text style={styles.gameItemDescription}>
              {currentItem.description} – {symbol}
              {currentItem.amount.toFixed(2)}
            </Text>
            {selectedSeedsForCurrent.length > 1 && (
              <Text style={styles.gameProgressText}>
                Split {symbol}{currentItem.amount.toFixed(2)} between {selectedSeedsForCurrent.length} people ({symbol}{(currentItem.amount / selectedSeedsForCurrent.length).toFixed(2)} each)
              </Text>
            )}
            {selectedSeedsForCurrent.length <= 1 && (
              <Text style={styles.gameProgressText}>
                Item {currentItemIndex} of {totalItems}
              </Text>
            )}
            {selectedSeedsForCurrent.length === 0 && (
              <Text style={styles.gameHint}>Tap who had this item, or split between multiple</Text>
            )}
          </>
        ) : (
          <Text style={styles.gameItemDescription}>No items left</Text>
        )}
      </View>

      <View style={styles.gameBoard} onLayout={(e) => setBoardSize(e.nativeEvent.layout)}>
        {playerSeeds.map((seed, index) => {
          const isLastAndAlone = n % 2 === 1 && index === playerSeeds.length - 1;
          const width = isLastAndAlone ? tileWidth * numCols : tileWidth;
          const total = totalsByAvatarSeed[seed] ?? { total: 0, count: 0 };
          const isMyTile = seed === myAvatarSeed;
          const showFlash = seed === lastClaimedSeed;
          const isSelected = selectedSeedsForCurrent.includes(seed);

          return (
            <Animated.View
              key={seed}
              style={[
                { width, height: tileHeight },
                isMyTile && myTileStyle,
              ]}
            >
              {showFlash && (
                <Animated.View
                  style={[
                    StyleSheet.absoluteFill,
                    styles.gameTileFlash,
                    flashOpacityStyle,
                  ]}
                  pointerEvents="none"
                />
              )}
              <TouchableOpacity
                style={[
                  styles.gameTileCompact,
                  {
                    width,
                    height: tileHeight,
                  },
                  (isSelected || lastClaimedSeed === seed) && styles.colourBoxHighlight,
                ]}
                onPress={() => onToggleSelection(seed)}
                activeOpacity={0.85}
              >
                <Avatar seed={seed} size={40} />
                <Text style={styles.gameTileNameCompact} numberOfLines={1}>
                  {getAvatarDisplayName(seed)}
                </Text>
                <Text style={styles.gameTileTotalCompact}>
                  {symbol}
                  {total.total.toFixed(2)} · {total.count} items
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>

      <View style={styles.gameBottom}>
        {currentItem && selectedSeedsForCurrent.length >= 1 && (
          <TouchableOpacity style={styles.primaryButton} onPress={onContinue} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </TouchableOpacity>
        )}
        {currentItem && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip} activeOpacity={0.8}>
            <Text style={styles.skipButtonText}>Skip this item</Text>
          </TouchableOpacity>
        )}
        {remainingCount > 0 && (
          <TouchableOpacity style={styles.finishButton} onPress={onFinish} activeOpacity={0.8}>
            <Text style={styles.finishButtonText}>Finish (show leaderboard)</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showWhoHadModal} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={onSkipUnclaimed}
        >
          <View style={styles.whoHadCard}>
            <Text style={styles.whoHadTitle}>Who had this?</Text>
            <View style={styles.whoHadGrid}>
              {playerSeeds.map((seed) => {
                const isSelected = selectedSeedsForCurrent.includes(seed);
                return (
                  <TouchableOpacity
                    key={seed}
                    style={[
                      styles.whoHadTileAvatar,
                      isSelected && styles.colourBoxHighlight,
                    ]}
                    onPress={() => onToggleSelection(seed)}
                    activeOpacity={0.85}
                  >
                    <Avatar seed={seed} size={44} />
                    <Text style={styles.whoHadTileLabelAvatar}>{getAvatarDisplayName(seed)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedSeedsForCurrent.length >= 1 && (
              <TouchableOpacity style={styles.primaryButton} onPress={onContinue} activeOpacity={0.8}>
                <Text style={styles.primaryButtonText}>Continue</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.skipButton} onPress={onSkipUnclaimed} activeOpacity={0.8}>
              <Text style={styles.skipButtonText}>Skip (unclaimed)</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

/** Per-person line in leaderboard expand list: item plus this person's share (for splits). */
interface LeaderboardItemEntry {
  item: ReceiptLineItem;
  splitAmount: number;
}

interface SplitLeaderboardViewProps {
  playerCount: number;
  items: ReceiptLineItem[];
  claimedBy: Record<string, string[]>;
  playerSeeds: string[];
  symbol: string;
  onDone: () => void;
  styles: ReturnType<typeof createStyles>;
}

function SplitLeaderboardView({
  playerCount,
  items,
  claimedBy,
  playerSeeds,
  symbol,
  onDone,
  styles,
}: SplitLeaderboardViewProps) {
  const { colors: themeColors } = useTheme();
  const totals: Record<string, number> = {};
  const itemsBySeed: Record<string, LeaderboardItemEntry[]> = {};
  playerSeeds.forEach((seed) => {
    totals[seed] = 0;
    itemsBySeed[seed] = [];
  });
  let unclaimedTotal = 0;
  items.forEach((item) => {
    const assignees = claimedBy[item.id];
    if (assignees && assignees.length > 0) {
      const share = item.amount / assignees.length;
      assignees.forEach((seed) => {
        if (totals[seed] !== undefined) {
          totals[seed] += share;
          itemsBySeed[seed].push({ item, splitAmount: share });
        }
      });
    } else {
      unclaimedTotal += item.amount;
    }
  });

  const sorted = playerSeeds
    .map((seed) => ({ seed, total: totals[seed] ?? 0, itemList: itemsBySeed[seed] ?? [] }))
    .sort((a, b) => b.total - a.total);

  const [expandedSeed, setExpandedSeed] = useState<string | null>(null);
  const mostExpensiveItem = items.reduce(
    (best, item) => (!best || item.amount > best.amount ? item : best),
    null as ReceiptLineItem | null
  );
  const mostExpensiveAssignees = mostExpensiveItem ? claimedBy[mostExpensiveItem.id] : null;
  const mostExpensiveSeed = mostExpensiveAssignees?.[0] ?? null;
  const mostExpensiveName = mostExpensiveSeed ? getAvatarDisplayName(mostExpensiveSeed) : null;

  return (
    <View style={styles.leaderboardRoot}>
      <ScrollView
        style={styles.leaderboardScroll}
        contentContainerStyle={styles.leaderboardScrollContent}
        showsVerticalScrollIndicator={true}
      >
        <Text style={styles.leaderboardTitle}>Split complete</Text>
        <Text style={styles.leaderboardSubtitle}>Who owes what</Text>

        <View style={styles.leaderboardList}>
          {sorted.map(({ seed, total, itemList }, index) => {
          const isFirst = index === 0;
          const isLast = index === sorted.length - 1;
          const name = getAvatarDisplayName(seed);
          const title = isFirst
            ? `Big Spender – ${name}`
            : isLast
              ? `Cheapest Bill – ${name}`
              : `Middle of the pack – ${name}`;
          const expanded = expandedSeed === seed;
          return (
            <View key={seed} style={styles.leaderboardRow}>
              <TouchableOpacity
                style={styles.leaderboardRowTouchable}
                onPress={() => setExpandedSeed(expanded ? null : seed)}
                activeOpacity={0.8}
              >
                <View style={styles.leaderboardRowContent}>
                  <Text style={styles.leaderboardRowTitle}>{title}</Text>
                  <Text style={styles.leaderboardAmount}>
                    {symbol}
                    {total.toFixed(2)}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={themeColors.textSecondary}
                />
              </TouchableOpacity>
              {expanded && itemList.length > 0 && (
                <View style={styles.leaderboardExpandList}>
                  {itemList.map(({ item, splitAmount }) => (
                    <View key={item.id} style={styles.leaderboardExpandRow}>
                      <Text style={styles.leaderboardExpandDesc}>{item.description}</Text>
                      <Text style={styles.leaderboardExpandAmt}>
                        {symbol}
                        {splitAmount.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {unclaimedTotal > 0 && (
          <View style={styles.leaderboardRow}>
            <View style={styles.leaderboardRowTouchable}>
              <Text style={styles.leaderboardLabel}>Unclaimed</Text>
              <Text style={styles.leaderboardAmount}>
                {symbol}
                {unclaimedTotal.toFixed(2)}
              </Text>
            </View>
          </View>
        )}
        </View>

        {mostExpensiveName && mostExpensiveItem && (
          <View style={styles.funStatCard}>
            <Text style={styles.funStatText}>
              Most expensive item: {mostExpensiveName}'s {mostExpensiveItem.description}
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.secondaryButton} onPress={onDone} activeOpacity={0.8}>
          <Text style={styles.secondaryButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function createStyles(c: {
  background: string;
  surface: string;
  primary: string;
  text: string;
  textSecondary: string;
  border: string;
}) {
  return StyleSheet.create({
    setupRoot: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    setupTitle: {
      ...typography.h3,
      color: c.text,
      marginBottom: 8,
    },
    setupSubtitle: {
      ...typography.body,
      color: c.textSecondary,
      marginBottom: 24,
    },
    pickerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 32,
    },
    pickerButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pickerButtonSelected: {
      borderColor: c.primary,
      backgroundColor: c.primary + '15',
    },
    pickerButtonText: {
      ...typography.body,
      fontWeight: '600',
      color: c.text,
    },
    pickerButtonTextSelected: {
      color: c.primary,
    },
    primaryButton: {
      backgroundColor: c.primary,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButtonText: {
      ...typography.body,
      fontWeight: '600',
      color: c.background,
    },
    cancelButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    cancelButtonText: {
      ...typography.bodySmall,
      color: c.textSecondary,
    },
    lobbyRoot: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    lobbyTitle: {
      ...typography.h2,
      color: c.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    lobbyReceiptLine: {
      ...typography.h3,
      color: c.primary,
      marginBottom: 4,
      textAlign: 'center',
    },
    lobbySubtitle: {
      ...typography.body,
      color: c.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    lobbyBoard: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'flex-start',
      flex: 1,
      marginBottom: 24,
    },
    lobbyTile: {
      borderRadius: 12,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
      padding: 8,
    },
    lobbyTileDisabled: {
      backgroundColor: c.surface,
    },
    lobbyTileLabel: {
      ...typography.body,
      fontWeight: '700',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    lobbyTileReady: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
    lobbyTileAvatar: {
      backgroundColor: c.surface,
      borderRadius: 0,
      borderWidth: 2,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 8,
    },
    lobbyTileName: {
      ...typography.body,
      fontWeight: '600',
      marginTop: 6,
      textAlign: 'center',
    },
    lobbyTileHint: {
      fontSize: 11,
      color: c.textSecondary,
      marginTop: 4,
    },
    gameRoot: {
      flex: 1,
      paddingHorizontal: 0,
    },
    gameTop: {
      paddingTop: 16,
      paddingBottom: 12,
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    gameItemDescription: {
      ...typography.h3,
      color: c.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    gameItemAmount: {
      fontSize: 28,
      fontWeight: '700',
      color: c.primary,
      marginBottom: 8,
    },
    gameHint: {
      ...typography.caption,
      color: c.textSecondary,
    },
    gameProgressText: {
      ...typography.caption,
      color: c.textSecondary,
      marginBottom: 8,
    },
    queueRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    queueLabel: {
      ...typography.caption,
      color: c.textSecondary,
    },
    queuePill: {
      backgroundColor: c.surface,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    queuePillText: {
      ...typography.caption,
      color: c.text,
      maxWidth: 80,
    },
    gameBoard: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignContent: 'flex-start',
    },
    colourTile: {
      borderRadius: 0,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    gameTileAvatar: {
      backgroundColor: c.surface,
      borderRadius: 0,
      borderWidth: 2,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 8,
    },
    gameTileCompact: {
      backgroundColor: c.surface,
      borderRadius: 0,
      borderWidth: 2,
      borderColor: c.border,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    gameTileNameCompact: {
      ...typography.body,
      fontWeight: '600',
      color: c.text,
      marginBottom: 2,
      textAlign: 'center',
    },
    gameTileTotalCompact: {
      ...typography.caption,
      fontWeight: '600',
      color: c.textSecondary,
      textAlign: 'center',
    },
    gameTileFlash: {
      backgroundColor: c.primary,
      borderRadius: 0,
      opacity: 0.3,
    },
    colourBoxHighlight: {
      borderColor: c.primary,
      borderWidth: 3,
    },
    colourBoxLabel: {
      ...typography.body,
      fontWeight: '700',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0,0,0,0.4)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    gameTileName: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: c.text,
      marginTop: 4,
      textAlign: 'center',
    },
    colourBoxTotal: {
      fontSize: 12,
      fontWeight: '600',
      color: c.text,
      marginTop: 2,
    },
    gameBottom: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    skipButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginBottom: 8,
    },
    skipButtonText: {
      ...typography.bodySmall,
      color: c.textSecondary,
      fontWeight: '600',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    whoHadCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 24,
      width: '100%',
      maxWidth: 340,
      borderWidth: 1,
      borderColor: c.border,
    },
    whoHadTitle: {
      ...typography.h3,
      color: c.text,
      marginBottom: 16,
      textAlign: 'center',
    },
    whoHadGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
      justifyContent: 'center',
    },
    whoHadTile: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      minWidth: 80,
      alignItems: 'center',
    },
    whoHadTileAvatar: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 0,
      minWidth: 72,
      alignItems: 'center',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    whoHadTileLabel: {
      ...typography.body,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    whoHadTileLabelAvatar: {
      ...typography.caption,
      fontWeight: '600',
      color: c.text,
      marginTop: 4,
    },
    finishButton: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      marginTop: 16,
    },
    finishButtonText: {
      ...typography.bodySmall,
      color: c.textSecondary,
      fontWeight: '600',
    },
    leaderboardRoot: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 24,
    },
    leaderboardScroll: {
      flex: 1,
    },
    leaderboardScrollContent: {
      paddingBottom: 120,
    },
    leaderboardTitle: {
      ...typography.h3,
      color: c.text,
      marginBottom: 4,
    },
    leaderboardSubtitle: {
      ...typography.bodySmall,
      color: c.textSecondary,
      marginBottom: 24,
    },
    leaderboardList: {
      marginBottom: 32,
    },
    leaderboardRow: {
      backgroundColor: c.surface,
      borderRadius: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    leaderboardRowTouchable: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      gap: 12,
    },
    leaderboardRowContent: {
      flex: 1,
    },
    leaderboardRowTitle: {
      ...typography.body,
      fontWeight: '700',
      color: c.text,
      marginBottom: 2,
    },
    leaderboardExpandList: {
      paddingHorizontal: 12,
      paddingBottom: 12,
      paddingTop: 0,
    },
    leaderboardExpandRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      paddingHorizontal: 8,
      backgroundColor: c.background,
      borderRadius: 8,
      marginBottom: 4,
    },
    leaderboardExpandDesc: {
      ...typography.bodySmall,
      color: c.text,
    },
    leaderboardExpandAmt: {
      ...typography.bodySmall,
      fontWeight: '600',
      color: c.text,
    },
    leaderboardSwatch: {
      width: 24,
      height: 24,
      borderRadius: 12,
    },
    leaderboardSwatchUnclaimed: {
      backgroundColor: c.textSecondary,
    },
    leaderboardLabel: {
      flex: 1,
      ...typography.body,
      fontWeight: '600',
      color: c.text,
    },
    leaderboardAmount: {
      ...typography.body,
      fontWeight: '700',
      color: c.text,
    },
    funStatCard: {
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: c.border,
    },
    funStatText: {
      ...typography.bodySmall,
      color: c.textSecondary,
      textAlign: 'center',
    },
    secondaryButton: {
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    secondaryButtonText: {
      ...typography.body,
      fontWeight: '600',
      color: c.text,
    },
  });
}
