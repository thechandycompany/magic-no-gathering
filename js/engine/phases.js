/**
 * phases.js - Turn phases, steps, and timing definitions
 *
 * Defines the structure of a turn: phases, steps, their ordered sequence,
 * priority rules, sorcery-speed legality, human-readable labels,
 * step-to-phase mapping, and the canCastAtTiming helper.
 */

var TURN_PHASES = {
  BEGINNING: "beginning",
  PRECOMBAT_MAIN: "precombat_main",
  COMBAT: "combat",
  POSTCOMBAT_MAIN: "postcombat_main",
  ENDING: "ending"
};

var TURN_STEPS = {
  // Beginning phase
  UNTAP: "untap",
  UPKEEP: "upkeep",
  DRAW: "draw",
  // Pre-combat main phase (single step)
  PRECOMBAT_MAIN: "precombat_main",
  // Combat phase (single combined step)
  COMBAT: "combat",
  // Post-combat main phase (single step)
  POSTCOMBAT_MAIN: "postcombat_main",
  // Ending phase
  END_STEP: "end_step",
  CLEANUP: "cleanup"
};

// Ordered progression through a full player turn
var PLAYER_TURN_SEQUENCE = [
  { phase: TURN_PHASES.BEGINNING,       step: TURN_STEPS.UNTAP },
  { phase: TURN_PHASES.BEGINNING,       step: TURN_STEPS.UPKEEP },
  { phase: TURN_PHASES.BEGINNING,       step: TURN_STEPS.DRAW },
  { phase: TURN_PHASES.PRECOMBAT_MAIN,  step: TURN_STEPS.PRECOMBAT_MAIN },
  { phase: TURN_PHASES.COMBAT,          step: TURN_STEPS.COMBAT },
  { phase: TURN_PHASES.POSTCOMBAT_MAIN, step: TURN_STEPS.POSTCOMBAT_MAIN },
  { phase: TURN_PHASES.ENDING,          step: TURN_STEPS.END_STEP },
  { phase: TURN_PHASES.ENDING,          step: TURN_STEPS.CLEANUP }
];

// Steps where NO player gets priority (automatic game actions only)
var NO_PRIORITY_STEPS = new Set([TURN_STEPS.UNTAP, TURN_STEPS.CLEANUP]);

// Steps where sorcery-speed spells/abilities are legal (main phases, stack empty)
var SORCERY_SPEED_STEPS = new Set([TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN]);

// Human-readable labels for the phase indicator
var STEP_LABELS = {
  [TURN_STEPS.UNTAP]: "Untap",
  [TURN_STEPS.UPKEEP]: "Upkeep",
  [TURN_STEPS.DRAW]: "Upkeep + Draw",
  [TURN_STEPS.PRECOMBAT_MAIN]: "Main Phase 1",
  [TURN_STEPS.COMBAT]: "Combat",
  [TURN_STEPS.POSTCOMBAT_MAIN]: "Main Phase 2",
  [TURN_STEPS.END_STEP]: "End Step",
  [TURN_STEPS.CLEANUP]: "Cleanup"
};

// Which phase a step belongs to (for grouping in the UI bar)
var STEP_TO_PHASE = {};
PLAYER_TURN_SEQUENCE.forEach(function(entry) { STEP_TO_PHASE[entry.step] = entry.phase; });

/**
 * Checks if a spell/ability can be cast at the given step.
 * @param {"instant"|"sorcery"} timing - The timing restriction of the card
 * @param {string} currentStep - The current TURN_STEPS value
 * @param {boolean} isActivePlayer - Whether the caster is the active (turn) player
 * @returns {boolean}
 */
function canCastAtTiming(timing, currentStep, isActivePlayer) {
  // Nothing can be done during untap or cleanup (no priority)
  if (NO_PRIORITY_STEPS.has(currentStep)) return false;
  // Instants (and flash) can be cast any time a player has priority
  if (timing === "instant") return true;
  // Sorcery-speed only during the active player's main phases
  if (timing === "sorcery") return isActivePlayer && SORCERY_SPEED_STEPS.has(currentStep);
  return false;
}
