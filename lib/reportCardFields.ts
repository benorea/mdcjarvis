// Mirrors mdc_field_maps() in mayday-hub/includes/report-cards/report-cards.php.
// Keep these two in sync — this is the exact vocabulary the WordPress report
// card system understands. The submit_report_card tool is instructed to use
// ONLY these keys and leave a field blank rather than invent a value that
// isn't in this list.

export const DAY_FIELDS = {
  appetite_am: ["all", "most", "some", "none"],
  appetite_pm: ["all", "most", "some", "none"],
  body_check: ["all_good", "other"],
  engagement_drive: ["high", "medium", "low"],
  energy_level: ["baseline", "low_tired", "high_happy", "dysregulated"],
  manners: ["polite", "trying_best", "pushy", "rude"],
  elims: ["walks", "patio", "accident", "potty_pads"],
  state_of_mind: [
    "settled", "content", "social", "focused", "over_aroused",
    "disengaged", "cautious", "sensitive", "anxious", "eustress",
  ],
  cooperation: ["enthusiastic", "needed_help", "easily_redirected", "chaos"],
  enrichment_motivator: ["treats", "toys", "praise", "other"],
  rest: ["deep_sleep", "restless", "light_nap", "unable_to_settle"],
  social_log: ["social_butterfly", "wallflower", "selective", "solo"],
  sensitivities: [
    "doorbell", "fast_movement", "handling", "leash_tension", "new_objects",
    "other_dogs", "shadows", "sounds", "television", "thresholds", "traffic", "wildlife",
  ],
  feeling: ["frustrated", "anxious", "vigilant", "conflicted"],
} as const;

export const WALK_FIELDS = {
  walk_location: [
    "neighborhood", "kennedy_fields", "kennedy_dog_park", "hampden_park",
    "village_greens", "cherry_creek", "the_reservoir", "sniffspot",
  ],
  triggers_quantity: ["none", "few", "several", "many"],
  urination: ["normal", "marking", "none"],
  defecation: ["normal", "loose", "firm", "none"],
  panting: ["none", "thermal", "stressed"],
  post_walk_recovery: ["fast_solo", "slow", "needed_help"],
  walk_choice: ["dog_led", "mix_switch", "handler_led"],
  sniff_scale: ["none", "standard", "deep"],
  state_of_mind_walk: ["grounded", "over_aroused"],
  social_coping: ["distance_seeking", "neutral", "attempted_approach"],
  leash_tension: ["loose", "intermittent", "consistent_pulling"],
  cohesion: ["disconnected", "needed_guidance", "voluntarily_responsive"],
  gait: ["usual", "stiff", "limp", "lame"],
} as const;

export const FREE_TEXT_FIELDS = [
  "meds",
  "enrichment",
  "body_check_notes",
  "botd", // "buddy/best of the day" — who they socialized with
  "tension_with",
  "extra_notes",
] as const;

export function fieldVocabularyForPrompt(): string {
  const lines: string[] = [];
  lines.push("Day report fields (valid keys only — comma-separate if more than one applies):");
  for (const [field, values] of Object.entries(DAY_FIELDS)) {
    lines.push(`  ${field}: ${values.join(", ")}`);
  }
  lines.push("Walk report fields (valid keys only — comma-separate if more than one applies):");
  for (const [field, values] of Object.entries(WALK_FIELDS)) {
    lines.push(`  ${field}: ${values.join(", ")}`);
  }
  lines.push(`Free-text fields (write naturally, no enum): ${FREE_TEXT_FIELDS.join(", ")}`);
  return lines.join("\n");
}
