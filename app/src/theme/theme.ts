/**
 * Design tokens for TRPGMaster — dark fantasy TTRPG theme.
 * Single source of truth for colors, fonts, radii, and spacing.
 */

export const theme = {
  color: {
    ink: '#0e0d12',
    parchment: '#e8dcc0',
    emerald: '#2f7d5b',
    gold: '#b8893a',
    blood: '#7a2230',
    fog: '#3a3f4b',
    muted: '#6c6a7a',
    highlight: '#c4a54e',
    // Semantic aliases
    bg: '#0e0d12',
    bgCard: '#16141e',
    bgInput: '#16213e',
    text: '#e8dcc0',
    textDim: '#6c6a7a',
    textBright: '#f0ead6',
    accent: '#c4a54e',
    danger: '#7a2230',
    success: '#2f7d5b',
    warning: '#b8893a',
  },
  font: {
    display: 'Cinzel',
    body: 'EBGaramond',
    mono: 'monospace',
  },
  radius: {
    card: 10,
    button: 6,
    input: 8,
  },
  space: [0, 4, 8, 12, 16, 24, 32, 48] as const,
} as const;

export type Theme = typeof theme;
