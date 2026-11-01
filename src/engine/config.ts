/**
 * Every tunable number in the game lives here. Values marked PROPOSAL in the
 * spec are defaults until the user approves or changes them.
 */

export const LB_PER_KG = 2.2046226218;
export const KM_PER_MILE = 1.609344;

export const CONFIG = {
  /** A session must last at least this long to count toward the weekly target. */
  minCreditedMinutes: 20,

  /** XP multipliers by category (Progression > Volume = Intensity > Variety = Recovery). */
  weights: {
    progression: 3,
    volume: 2,
    intensity: 2,
    variety: 1,
    recovery: 1,
  },

  /** Raw points before weighting. */
  points: {
    volumePerMinute: 1,
    volumeMinuteCap: 120,
    volumePerTonneLifted: 2, // per 1,000 kg of working-set tonnage
    volumePerKm: { swim: 10, ride: 1, run: 4, walk: 1, lift: 0, class: 0, other: 0 } as Record<string, number>,
    intensityPerZone3Minute: 1.5,
    intensityPerRpeAbove5: 3,
    varietyNewKindInWeek: 20,
    progressionPerPr: 40,
    recoverySleepOk: 10,
    recoveryHrvOk: 5,
    recoveryRestDay: 5,
  },

  /** Turning Health Connect records into workouts. PROPOSAL values until confirmed. */
  ingest: {
    /** An auto-detected walk counts as a workout only if it lasts at least this long (after merging). */
    walkWorkoutMinMinutes: 45,
    /** ...and only if its average pace is at least this fast (km/h), which filters out wandering around the house or office. 0 turns the filter off. */
    walkWorkoutMinKmh: 3,
    /** Walk fragments separated by less than this are one walk. */
    walkMergeGapMinutes: 10,
    /** Two sessions overlapping by this fraction of the shorter one are the same session. */
    overlapFraction: 0.5,
    /** When two apps recorded the same session, the app earlier in this list wins. */
    originPriority: [
      'com.buffnik.app',
      'io.strongapp.strong',
      'com.strava',
      'com.ultrahuman.android',
      'com.fitbit.FitbitMobile',
      'com.google.android.apps.fitness',
    ],
    /** Heart rate at or above this fraction of max HR counts as hard effort (intensity XP). */
    zoneThresholdFraction: 0.7,
    /** Width of a heart-rate histogram bucket (bpm), and the longest a single sample is assumed to last. */
    hrBucketBpm: 5,
    hrSampleMaxSeconds: 120,
    /** Health Connect sleep stages that do not count as sleep: awake, out of bed. */
    sleepExcludedStages: [1, 3],
  },

  /** XP needed to go from level n to n+1 = base + step * (n - 1). */
  levelCurve: { base: 600, step: 75 },

  /** Coins earned per XP earned. Tuned so a good week ≈ 800–1,000 coins. */
  coinsPerXp: 1.2,

  /** Weekly target and penalties. */
  week: {
    targetWorkouts: 2,
    bonusWorkoutXp: 100,
    freezeEveryNWeeksOnTarget: 4,
    maxBankedFreezes: 3,
    missedWeekCoinPenalty: 250,
    missedWeekStatDecay: 0.05,
    idleStatDecay: 0.02,
    idleWeeksBeforeDecay: 2,
    missedWeekBossHealFraction: 0.1,
  },

  /** Stat gains. Stats start at 10. */
  stats: {
    start: 10,
    strPerLiftSession: 0.5,
    strPerPr: 1,
    endPerCardioMinute: 0.02,
    vitPerGoodSleepDay: 0.1,
    agiPerActiveDay: 0.1,
    agiActiveDaySteps: 8000,
    agiPerNewKind: 0.5,
    phyPerPctBodyFatLost: 4,
    phyPerKgLeanGained: 3,
    max: 100,
  },

  /** Body build tier thresholds on (STR + PHY) / 2. Tier 1 is the starting build. */
  buildTierThresholds: [0, 20, 35, 55, 80],

  /** Money. */
  economy: {
    coinsPerUsd: 10,
    monthlyBudgetUsd: 500,
    vaultCapUsd: 1500,
    /** Coin price of a look in the shop, by rarity. PROPOSAL. */
    lookCoinPrices: { common: 200, rare: 600, epic: 1500, legendary: 4000 },
    /** Coin price of a gear item (hat, weapon...) by rarity. PROPOSAL. */
    gearCoinPrices: { common: 60, rare: 200, epic: 500, legendary: 1500 },
  },

  /** Loot. Weights are relative. */
  loot: {
    dropChancePerWorkout: 0.35,
    rarityWeights: { common: 70, rare: 22, epic: 7, legendary: 1 },
    voucherUsd: 25,
  },

  /** Bosses. */
  bosses: {
    fiveBoros: {
      eventDate: '2027-05-02',
      maxHp: 1000,
      hpPerCyclingMinute: 1,
      staggerFloorFraction: 0.1,
      milestonesMiles: [10, 20, 30, 35],
      milestoneDamage: [50, 100, 150, 200],
      finishingRideMiles: 30,
    },
    descent: {
      thresholdsLb: [190, 185, 180, 175, 170],
      hpPerLb: 10,
      maxLossFractionPerWeek: 0.01,
      averagingDays: 7,
    },
  },
} as const;

export type Config = typeof CONFIG;
