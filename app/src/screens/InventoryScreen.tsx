import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useGameStore } from '../store/gameStore';
import { sendSceneSearch, sendLootPickup } from '../hooks/useSocket';
import { theme } from '../theme/theme';
import type { InventoryItem, LootResult } from '@trpgmaster/shared';

export function InventoryScreen() {
  const navigation = useNavigation();
  const character = useGameStore((s) => s.character);
  const pendingLoot = useGameStore((s) => s.pendingLoot);
  const setPendingLoot = useGameStore((s) => s.setPendingLoot);
  const aiProcessing = useGameStore((s) => s.aiProcessing);

  const inventory: InventoryItem[] = character?.inventory ?? [];
  const gold = character?.gold ?? { coins: 0, handfuls: 0, bags: 0, chests: 0 };

  const formatGold = () => {
    const parts: string[] = [];
    if (gold.chests > 0) parts.push(`${gold.chests}箱`);
    if (gold.bags > 0) parts.push(`${gold.bags}袋`);
    if (gold.handfuls > 0) parts.push(`${gold.handfuls}把`);
    if (gold.coins > 0) parts.push(`${gold.coins}枚`);
    return parts.length > 0 ? parts.join(' ') : '0枚';
  };

  const handleSearchScene = () => {
    sendSceneSearch();
  };

  const handlePickupLoot = () => {
    if (!pendingLoot) return;
    const allIds = pendingLoot.items.map(i => i.id);
    sendLootPickup(allIds);
    setPendingLoot(null);
  };

  const handleDismissLoot = () => {
    setPendingLoot(null);
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'consumable': return 'flask-outline';
      case 'tool': return 'construct-outline';
      case 'treasure': return 'diamond-outline';
      default: return 'cube-outline';
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'consumable': return theme.color.emerald;
      case 'tool': return theme.color.fog;
      case 'treasure': return theme.color.accent;
      default: return theme.color.textDim;
    }
  };

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
    const color = getCategoryColor(item.category);
    return (
      <View style={styles.itemCard}>
        <Ionicons name={getCategoryIcon(item.category)} size={18} color={color} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.description && (
            <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
          )}
        </View>
        <Text style={styles.itemQuantity}>×{item.quantity}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={24} color={theme.color.parchment} />
        </TouchableOpacity>
        <Text style={styles.title}>物品</Text>
        <Text style={styles.goldDisplay}>
          <Ionicons name="cash-outline" size={14} color={theme.color.warning} />
          {formatGold()}
        </Text>
      </View>

      {/* Search scene button */}
      <TouchableOpacity
        style={[styles.searchButton, aiProcessing && styles.searchButtonDisabled]}
        onPress={handleSearchScene}
        disabled={aiProcessing}
      >
        <Ionicons name="search-outline" size={18} color={theme.color.accent} />
        <Text style={styles.searchButtonText}>探查场景</Text>
      </TouchableOpacity>

      {/* Inventory list */}
      {inventory.length > 0 ? (
        <FlatList
          data={inventory}
          keyExtractor={(item) => item.id}
          renderItem={renderInventoryItem}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyState}>
          <Ionicons name="bag-handle-outline" size={48} color={theme.color.fog} />
          <Text style={styles.emptyTitle}>背包为空</Text>
          <Text style={styles.emptySubtitle}>探查场景或结束战斗可获得物品</Text>
        </View>
      )}

      {/* Loot modal */}
      {pendingLoot && (
        <Modal visible animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>战利品</Text>
              {pendingLoot.items.length > 0 ? (
                pendingLoot.items.map((item) => (
                  <View key={item.id} style={styles.lootItem}>
                    <Ionicons name={getCategoryIcon(item.category)} size={16} color={getCategoryColor(item.category)} />
                    <Text style={styles.lootItemName}>{item.name}</Text>
                    <Text style={styles.lootItemQty}>×{item.quantity}</Text>
                  </View>
                ))
              ) : (
                <Text style={styles.lootNothing}>没有物品，只有金币</Text>
              )}
              {pendingLoot.gold && (
                <View style={styles.lootGold}>
                  <Ionicons name="cash-outline" size={16} color={theme.color.warning} />
                  <Text style={styles.lootGoldText}>
                    {pendingLoot.gold.coins}枚金币
                  </Text>
                </View>
              )}
              <View style={styles.lootButtons}>
                <TouchableOpacity style={styles.lootPickupButton} onPress={handlePickupLoot}>
                  <Text style={styles.lootPickupText}>拾取全部</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.lootDismissButton} onPress={handleDismissLoot}>
                  <Text style={styles.lootDismissText}>放弃</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.ink,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.color.bgInput,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.fog,
  },
  title: {
    color: theme.color.parchment,
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
  },
  goldDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    color: theme.color.warning,
    fontSize: 14,
    gap: 4,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.color.accent + '22',
    borderRadius: 8,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: theme.color.accent + '44',
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    color: theme.color.accent,
    fontSize: 14,
    fontFamily: theme.font.body,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.color.bgCard,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.color.fog,
    gap: 10,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    color: theme.color.parchment,
    fontSize: 14,
    fontFamily: theme.font.body,
  },
  itemDesc: {
    color: theme.color.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  itemQuantity: {
    color: theme.color.fog,
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    color: theme.color.textDim,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 12,
  },
  emptySubtitle: {
    color: theme.color.muted,
    fontSize: 13,
    marginTop: 4,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.color.bgCard,
    borderRadius: 16,
    padding: 20,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    color: theme.color.parchment,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: theme.font.display,
  },
  lootItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.fog,
  },
  lootItemName: {
    color: theme.color.parchment,
    fontSize: 14,
    flex: 1,
  },
  lootItemQty: {
    color: theme.color.fog,
    fontSize: 14,
  },
  lootNothing: {
    color: theme.color.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
  lootGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 4,
  },
  lootGoldText: {
    color: theme.color.warning,
    fontSize: 14,
    fontWeight: 'bold',
  },
  lootButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  lootPickupButton: {
    flex: 1,
    backgroundColor: theme.color.emerald,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  lootPickupText: {
    color: theme.color.ink,
    fontSize: 14,
    fontWeight: 'bold',
  },
  lootDismissButton: {
    flex: 1,
    backgroundColor: theme.color.fog,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  lootDismissText: {
    color: theme.color.ink,
    fontSize: 14,
  },
});
