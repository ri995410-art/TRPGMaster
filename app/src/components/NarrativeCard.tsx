import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { theme } from '../theme/theme';

interface Props {
  content: string;
  npcName?: string;
  isStreaming?: boolean;
}

export function NarrativeCard({ content, npcName, isStreaming }: Props) {
  const cursorOpacity = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (isStreaming && content.length > 0) {
      const blink = Animated.loop(
        Animated.sequence([
          Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      );
      blink.start();
      return () => blink.stop();
    }
  }, [isStreaming, content.length]);

  return (
    <View style={styles.card}>
      {npcName && <Text style={styles.npcName}>{npcName}</Text>}
      <Text style={styles.body}>{content}</Text>
      {isStreaming && content.length > 0 && (
        <Animated.Text style={[styles.cursor, { opacity: cursorOpacity }]}>|</Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    backgroundColor: theme.color.bgCard,
    borderRadius: theme.radius.card,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.color.gold,
  },
  npcName: {
    color: theme.color.accent,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: theme.font.display,
    marginBottom: 4,
  },
  body: {
    color: theme.color.parchment,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: theme.font.body,
  },
  cursor: {
    color: theme.color.highlight,
    fontSize: 16,
    fontWeight: 'bold',
  },
});
