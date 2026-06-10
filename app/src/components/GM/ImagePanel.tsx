import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Image } from 'react-native';
import { useGameStore } from '../../store/gameStore';

export function ImagePanel() {
  const generatedImages = useGameStore(s => s.generatedImages);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  if (generatedImages.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>场景图像</Text>
        </View>
        <Text style={styles.emptyText}>暂无生成图像</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>场景图像</Text>
        <Text style={styles.count}>{generatedImages.length}</Text>
      </View>
      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {generatedImages.map(img => (
          <TouchableOpacity
            key={img.id}
            style={styles.imageCard}
            onPress={() => setZoomedImage(img.url)}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: img.url }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
            <View style={styles.imageInfo}>
              <Text style={styles.imageCategory}>{img.category}</Text>
              <Text style={styles.tapHint}>点击放大</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Zoom Modal */}
      <Modal
        visible={zoomedImage !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setZoomedImage(null)}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalClose}
            onPress={() => setZoomedImage(null)}
          >
            <Text style={styles.modalCloseText}>关闭</Text>
          </TouchableOpacity>
          {zoomedImage && (
            <Image
              source={{ uri: zoomedImage }}
              style={styles.zoomedImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 12,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#8e44ad',
    fontSize: 16,
    fontWeight: 'bold',
  },
  count: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  imageCard: {
    backgroundColor: '#16213e',
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  thumbnail: {
    width: '100%',
    height: 120,
    borderRadius: 6,
  },
  imageInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  imageCategory: {
    color: '#7f8c8d',
    fontSize: 10,
  },
  tapHint: {
    color: '#8e44ad',
    fontSize: 10,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#2a2a4e',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1,
  },
  modalCloseText: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: 'bold',
  },
  zoomedImage: {
    width: '90%',
    height: '80%',
  },
});