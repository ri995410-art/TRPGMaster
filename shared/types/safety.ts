/**
 * Spotlight / Turn management types
 * Controls who can act in a multi-player session
 */

export interface SpotlightState {
  mode: 'freeform' | 'combat';
  current: string | null;   // playerId of current spotlight holder
  queue: string[];          // FIFO queue of playerIds waiting to act
  order?: string[];         // combat mode: ordered turn list
  round?: number;           // combat round counter
}

/**
 * Safety tools types (Session Zero, Lines/Veils, X-Card)
 * Used by 5.4 but defined here alongside SpotlightState
 */

export interface SafetyState {
  phase: 's0' | 'play';    // Session gate: s0 blocks player:action
  lines: string[];          // Hard no — never appear
  veils: string[];          // Fade to black — imply only
  toneFlags: string[];      // Tone preferences
  xcardActive: boolean;     // X-Card pressed — pause everything
}
