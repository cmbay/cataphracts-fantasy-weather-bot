// weather.js

// ----------------------
// Weather type constants - use these instead of string literals
// ----------------------
const Weather = Object.freeze({
  CLEAR_SKIES: "Clear Skies",
  LIGHT_RAIN: "Light Rain",
  HEAVY_RAIN: "Heavy Rain",
  STORM: "Storm",
  HOT: "Hot",
  HEATWAVE: "Heatwave",
  SNOW: "Snow",
  BLIZZARD: "Blizzard",
  FOG: "Fog",
});

// ----------------------
// Special Event: One-off Comet
// A rare celestial event visible across all regions on a specific date
// ----------------------
const COMET_DATE = {
  year: 2026,
  month: 6, // June (1-indexed)
  day: 15,
};

/**
 * Check if a given date is the comet date
 * @param {Date} date - The date to check
 * @returns {boolean} True if this is the comet date
 */
function isCometDate(date) {
  return (
    date.getUTCFullYear() === COMET_DATE.year &&
    date.getUTCMonth() + 1 === COMET_DATE.month &&
    date.getUTCDate() === COMET_DATE.day
  );
}

/**
 * Get comet event details if applicable
 * @returns {object} Comet event info
 */
function getCometEventInfo() {
  return {
    name: "Gunhilde",
    description:
      "The comet Gunhilde traces a bright green line across the sky. Everyone who sees it feels uplifted.",
    impact: "Recover 1 Morale",
  };
}

// All weather types as an array (for validation)
const ALL_WEATHER_TYPES = Object.values(Weather);

// ----------------------
// Simple seeded random number generator (Mulberry32)
// Ensures deterministic weather per date + region
function seededRandom(seed) {
  let a = seed ^ 0xdeadbeef;
  return function () {
    a |= 0;
    a = (a + 0x7f4a7c15) | 0;
    let t = Math.imul(a ^ (a >>> 13), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 9), 61 | t)) ^ t;
    return ((t ^ (t >>> 11)) >>> 0) / 4294967296;
  };
}

// ----------------------
// Hash a region ID to a numeric value
function hashRegion(regionId) {
  let hash = 0;
  for (let i = 0; i < regionId.length; i++) {
    hash = ((hash << 5) - hash + regionId.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

// ----------------------
// Weather Pattern System
// Weather occurs in variable-length epochs (2-5 days) and transitions
// must follow plausible paths between weather types
// ----------------------

// Transition paths for weather changes that need intermediate steps
// If a from->to pair is NOT in this table, it's a valid direct transition
// Each entry maps to an array of possible paths - one is chosen randomly
// Structure: TRANSITION_PATHS[fromWeather][toWeather] = [[path1], [path2], ...]

// Short aliases for readability
const {
  CLEAR_SKIES,
  LIGHT_RAIN,
  HEAVY_RAIN,
  STORM,
  HOT,
  HEATWAVE,
  SNOW,
  BLIZZARD,
  FOG,
} = Weather;

const TRANSITION_PATHS = {
  [HOT]: {
    [SNOW]: [
      [CLEAR_SKIES, LIGHT_RAIN],
      [LIGHT_RAIN, LIGHT_RAIN],
    ],
    [BLIZZARD]: [
      [CLEAR_SKIES, LIGHT_RAIN, SNOW],
      [LIGHT_RAIN, SNOW, SNOW],
    ],
    [FOG]: [[CLEAR_SKIES]],
  },

  [HEATWAVE]: {
    [SNOW]: [
      [HOT, CLEAR_SKIES, LIGHT_RAIN],
      [HOT, LIGHT_RAIN, LIGHT_RAIN],
    ],
    [BLIZZARD]: [
      [HOT, CLEAR_SKIES, LIGHT_RAIN, SNOW],
      [HOT, LIGHT_RAIN, SNOW, SNOW],
    ],
    [FOG]: [
      [HOT, CLEAR_SKIES],
      [LIGHT_RAIN, CLEAR_SKIES],
    ],
    [CLEAR_SKIES]: [[HOT]],
  },

  [SNOW]: {
    [HOT]: [[CLEAR_SKIES], [LIGHT_RAIN]],
    [HEATWAVE]: [
      [CLEAR_SKIES, HOT],
      [LIGHT_RAIN, CLEAR_SKIES, HOT],
    ],
    [HEAVY_RAIN]: [[LIGHT_RAIN]],
    [STORM]: [[LIGHT_RAIN, HEAVY_RAIN]],
  },

  [BLIZZARD]: {
    [HOT]: [
      [SNOW, CLEAR_SKIES],
      [FOG, CLEAR_SKIES],
    ],
    [HEATWAVE]: [
      [SNOW, CLEAR_SKIES, HOT],
      [FOG, CLEAR_SKIES, HOT],
    ],
    [CLEAR_SKIES]: [[SNOW], [FOG]],
    [HEAVY_RAIN]: [[LIGHT_RAIN], [SNOW, LIGHT_RAIN]],
    [STORM]: [
      [LIGHT_RAIN, HEAVY_RAIN],
      [FOG, LIGHT_RAIN, HEAVY_RAIN],
    ],
  },

  [STORM]: {
    [HOT]: [[CLEAR_SKIES], [FOG, CLEAR_SKIES]],
    [HEATWAVE]: [
      [CLEAR_SKIES, HOT],
      [FOG, CLEAR_SKIES, HOT],
    ],
    [SNOW]: [[FOG], [HEAVY_RAIN, LIGHT_RAIN]],
    [BLIZZARD]: [
      [FOG, SNOW],
      [HEAVY_RAIN, LIGHT_RAIN, SNOW],
    ],
  },

  [HEAVY_RAIN]: {
    [CLEAR_SKIES]: [[LIGHT_RAIN]],
    [HOT]: [
      [LIGHT_RAIN, CLEAR_SKIES],
      [FOG, CLEAR_SKIES],
    ],
    [HEATWAVE]: [
      [LIGHT_RAIN, CLEAR_SKIES, HOT],
      [FOG, CLEAR_SKIES, HOT],
    ],
    [SNOW]: [[LIGHT_RAIN]],
    [BLIZZARD]: [
      [LIGHT_RAIN, SNOW],
      [FOG, SNOW],
    ],
  },

  [FOG]: {
    [HOT]: [[CLEAR_SKIES]],
    [HEATWAVE]: [[CLEAR_SKIES, HOT]],
    [HEAVY_RAIN]: [[LIGHT_RAIN]],
    [STORM]: [[LIGHT_RAIN, HEAVY_RAIN]],
    [BLIZZARD]: [[SNOW]],
  },

  [LIGHT_RAIN]: {
    [HOT]: [[CLEAR_SKIES]],
    [HEATWAVE]: [[CLEAR_SKIES, HOT]],
    [STORM]: [[HEAVY_RAIN]],
    [BLIZZARD]: [[SNOW]],
  },

  [CLEAR_SKIES]: {
    [HEATWAVE]: [[HOT]],
    [BLIZZARD]: [[SNOW], [FOG, SNOW]],
    [HEAVY_RAIN]: [[LIGHT_RAIN]],
  },
};

// ----------------------
// Select a random transition path from available options
// Returns null if this is a valid direct transition (no path needed)
function selectTransitionPath(rng, fromWeather, toWeather) {
  if (fromWeather === toWeather) return null; // Same weather, no transition

  const paths = TRANSITION_PATHS[fromWeather]?.[toWeather];

  if (!paths || paths.length === 0) {
    // No path defined = valid direct transition
    return null;
  }

  // Pick a random path from the options
  const pathIndex = Math.floor(rng() * paths.length);
  return paths[pathIndex];
}

// ----------------------
// Get the day number (days since epoch) for a date
function getDayNumber(date) {
  return Math.floor(date.getTime() / 86400000);
}

// ----------------------
// Find which epoch a given day belongs to, and the day's position within it
// Epochs have variable length (2-5 days) determined by seeded RNG
// Uses a fixed reference point (day 0) for consistent epoch boundaries
function getEpochInfo(date, regionId) {
  const targetDay = getDayNumber(date);
  const regionOffset = hashRegion(regionId) % 1000;

  // FIXED reference point: start from day 0 and scan forward
  // We cache epoch boundaries per region, but for simplicity we scan each time
  // This ensures consistent epoch boundaries across all queries

  // Start scanning from a reasonable point (we know epochs are 2-5 days)
  // To find epoch containing targetDay, start from an epoch well before it
  // Use maximum epoch length (5 days) for conservative estimate to never overshoot
  const estimatedEpochNum = Math.floor(targetDay / 5); // Conservative: assume max length
  const startEpochNum = Math.max(0, estimatedEpochNum - 10); // Start 10 epochs back for safety

  // Calculate the starting day for startEpochNum by scanning from epoch 0
  let epochNumber = startEpochNum;
  let epochStart = 0;

  // Calculate actual epochStart for startEpochNum by simulating epochs from 0
  for (let e = 0; e < startEpochNum; e++) {
    const epochSeed = e * 7919 + regionOffset;
    const epochRng = seededRandom(epochSeed);
    const epochLength = 2 + Math.floor(epochRng() * 4);
    epochStart += epochLength;
  }

  // Scan forward to find the epoch containing targetDay
  while (true) {
    // Determine this epoch's length using seeded RNG (2-5 days)
    const epochSeed = epochNumber * 7919 + regionOffset;
    const epochRng = seededRandom(epochSeed);
    const epochLength = 2 + Math.floor(epochRng() * 4); // 2, 3, 4, or 5 days

    const epochEnd = epochStart + epochLength - 1;

    if (targetDay >= epochStart && targetDay <= epochEnd) {
      // Found our epoch
      return {
        epochNumber,
        epochLength,
        dayInEpoch: targetDay - epochStart, // 0-indexed day within epoch
        epochStart,
        epochEnd,
      };
    }

    if (epochStart > targetDay) {
      // We've gone past - this means our start estimate was wrong
      // This shouldn't happen with proper calculation, but handle it
      throw new Error(
        `Epoch calculation error: epochStart ${epochStart} > targetDay ${targetDay}`
      );
    }

    // Move to next epoch
    epochStart = epochEnd + 1;
    epochNumber++;
  }
}

// ----------------------
// Get the base weather for an epoch (before transition smoothing)
function getEpochBaseWeather(epochNumber, seasonConfig, regionId) {
  const epochSeed = epochNumber * 31337 + hashRegion(regionId);
  const rng = seededRandom(epochSeed);
  return rollFromTable(rng, seasonConfig.conditions);
}

// ----------------------
// Determine current season (Northern Hemisphere)
const getSeason = (date) => {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  if (month === 3 && day >= 20) return "spring";
  if (month === 4 || month === 5) return "spring";
  if (month === 6 && day < 21) return "spring";

  if (month === 6 && day >= 21) return "summer";
  if (month === 7 || month === 8) return "summer";
  if (month === 9 && day < 22) return "summer";

  if (month === 9 && day >= 22) return "autumn";
  if (month === 10 || month === 11) return "autumn";
  if (month === 12 && day < 21) return "autumn";

  return "winter";
};

// ----------------------
// Hardcoded mechanical impacts
const WEATHER_IMPACTS = {
  [Weather.CLEAR_SKIES]: {
    roadMult: 1,
    offRoadMult: 1,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special: "",
  },
  [Weather.LIGHT_RAIN]: {
    roadMult: 1,
    offRoadMult: 1,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special: "",
  },
  [Weather.HEAVY_RAIN]: {
    roadMult: 0.75,
    offRoadMult: 0.5,
    canForcedMarch: true,
    canNightMarch: false,
    zeroVisibility: false,
    canFordRivers: false,
    type: "Bad",
    special: "",
  },
  [Weather.STORM]: {
    roadMult: 0.5,
    offRoadMult: 0.25,
    canForcedMarch: false,
    canNightMarch: false,
    zeroVisibility: false,
    canFordRivers: false,
    type: "Very Bad",
    special: "",
  },
  [Weather.HOT]: {
    roadMult: 1,
    offRoadMult: 1,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special:
      "Day Marching more than 6 miles requires morale check. Force marching requires morale check.",
  },
  [Weather.HEATWAVE]: {
    roadMult: 0.75,
    offRoadMult: 0.5,
    canForcedMarch: false,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special: "Day Marching gives -1 Morale. Night Marching is fine.",
  },
  [Weather.SNOW]: {
    roadMult: 0.75,
    offRoadMult: 0.5,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "Bad",
    special: "",
  },
  [Weather.BLIZZARD]: {
    roadMult: 0.25,
    offRoadMult: 0,
    canForcedMarch: false,
    canNightMarch: false,
    zeroVisibility: true,
    canFordRivers: false,
    type: "Very Bad",
    special: "Marching gives -1 Morale.",
  },
  [Weather.FOG]: {
    roadMult: 1,
    offRoadMult: 1,
    canForcedMarch: false,
    canNightMarch: false,
    zeroVisibility: true,
    canFordRivers: false,
    type: "Very Bad",
    special:
      "1-in-6 wrong turn at forked roads. Off-road: 2-in-6 chance of becoming lost.",
  },
};

// ----------------------
// Weighted roll table
function rollFromTable(rng, entries) {
  const table = entries.map((entry) =>
    typeof entry === "string"
      ? { result: entry, weight: 1 }
      : { result: entry.result, weight: entry.weight ?? 1 }
  );

  let totalWeight = 0;
  for (const e of table) totalWeight += e.weight;

  let roll = rng() * totalWeight;
  for (const e of table) {
    if (roll < e.weight) return e.result;
    roll -= e.weight;
  }

  return table[table.length - 1].result;
}

// ----------------------
// Format impacts into human-readable array
function formatImpacts(impactData) {
  if (!impactData) return [];

  const impacts = [];

  // Road travel impacts
  if (impactData.roadMult < 1) {
    impacts.push(
      `Road travel at ${Math.round(impactData.roadMult * 100)}% speed`
    );
  }
  if (impactData.offRoadMult < 1) {
    if (impactData.offRoadMult === 0) {
      impacts.push("Off-road travel impossible");
    } else {
      impacts.push(
        `Off-road travel at ${Math.round(impactData.offRoadMult * 100)}% speed`
      );
    }
  }

  // March restrictions
  if (!impactData.canForcedMarch) {
    impacts.push("Forced marching not possible");
  }
  if (!impactData.canNightMarch) {
    impacts.push("Night marching not possible");
  }

  // Visibility
  if (impactData.zeroVisibility) {
    impacts.push("Zero visibility");
  }

  // River crossing
  if (!impactData.canFordRivers) {
    impacts.push("Cannot ford rivers");
  }

  // Battle and scouting impacts based on weather type
  if (impactData.type === "Bad") {
    impacts.push("-1 to battle rolls");
    impacts.push("Scouting range reduced by 1 hex");
  } else if (impactData.type === "Very Bad") {
    impacts.push("-1 to battle rolls");
    impacts.push("Scouting range reduced by 2 hexes");
  }

  // Special effects
  if (impactData.special) {
    impacts.push(impactData.special);
  }

  return impacts;
}

// ----------------------
// Anchor epoch for weather computation
// We iterate forward from this epoch with a known starting weather.
// Epoch 0 = day 0 (Jan 1, 1970), but we use a more recent anchor for efficiency.
// Anchor epoch ~5765 corresponds to roughly Jan 1, 2020.
const ANCHOR_EPOCH = 5765;
const ANCHOR_WEATHER = Weather.CLEAR_SKIES;

// ----------------------
// Get the effective weather at the end of an epoch (what we'd actually see)
// This accounts for transition paths that may not complete within the epoch.
// Iterates forward from ANCHOR_EPOCH with known starting weather.
function getEffectiveEpochEndWeather(epochNumber, seasonConfig, regionId) {
  const regionOffset = hashRegion(regionId) % 1000;

  // Start from anchor with known weather
  let effectiveWeather = ANCHOR_WEATHER;

  // Iterate forward from anchor to target epoch
  for (let e = ANCHOR_EPOCH; e <= epochNumber; e++) {
    // Get this epoch's length
    const epochSeed = e * 7919 + regionOffset;
    const epochRng = seededRandom(epochSeed);
    const epochLength = 2 + Math.floor(epochRng() * 4); // 2-5 days

    // Get the base weather for this epoch
    const baseWeather = getEpochBaseWeather(e, seasonConfig, regionId);

    // Check if transition needs intermediate steps
    const pathSeed = e * 54321 + regionOffset;
    const pathRng = seededRandom(pathSeed);
    const path = selectTransitionPath(pathRng, effectiveWeather, baseWeather);

    if (path) {
      // Transition requires intermediate steps
      // What weather would be on the last day of this epoch?
      const lastDayIndex = epochLength - 1;
      if (lastDayIndex < path.length) {
        // Still in transition - carry forward the intermediate weather
        effectiveWeather = path[lastDayIndex];
      } else {
        // Past transition - reached target weather
        effectiveWeather = baseWeather;
      }
    } else {
      // Direct transition (no intermediate steps needed)
      effectiveWeather = baseWeather;
    }
  }

  return effectiveWeather;
}

// ----------------------
// Main function: weather for a date using epoch-based pattern system
const getWeatherForDate = (
  date,
  seasonalWeatherConfig,
  regionId = "default"
) => {
  const season = getSeason(date);
  const seasonData = seasonalWeatherConfig[season];
  if (!seasonData) throw new Error(`No weather data for season '${season}'`);

  // Check for special comet event - overrides normal weather
  const hasComet = isCometDate(date);
  if (hasComet) {
    const formattedDate = date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    const dayOfWeek = date.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    });

    return {
      date: formattedDate,
      dayOfWeek,
      season,
      condition: Weather.CLEAR_SKIES,
      impacts: [],
      impactData: WEATHER_IMPACTS[Weather.CLEAR_SKIES],
      hasComet: true,
      cometEvent: getCometEventInfo(),
    };
  }

  // Get epoch info for this date
  const epochInfo = getEpochInfo(date, regionId);
  const { epochNumber, epochLength, dayInEpoch } = epochInfo;

  // Get the base weather for current epoch
  const currentEpochWeather = getEpochBaseWeather(
    epochNumber,
    seasonData,
    regionId
  );

  // Get the EFFECTIVE weather at the end of the previous epoch
  // (this accounts for incomplete transitions)
  const prevEffectiveWeather = getEffectiveEpochEndWeather(
    epochNumber - 1,
    seasonData,
    regionId
  );

  // Determine actual weather condition
  let condition;

  // Check if this transition requires intermediate steps
  const regionOffset = hashRegion(regionId) % 1000;
  const pathSeed = epochNumber * 54321 + regionOffset;
  const pathRng = seededRandom(pathSeed);
  const path = selectTransitionPath(
    pathRng,
    prevEffectiveWeather,
    currentEpochWeather
  );

  if (path) {
    // Transition requires intermediate steps
    if (dayInEpoch < path.length) {
      // Use intermediate weather from the transition path
      condition = path[dayInEpoch];
    } else {
      // Past the transition period - use the target weather
      condition = currentEpochWeather;
    }
  } else {
    // Direct transition - use current epoch weather
    condition = currentEpochWeather;
  }

  const impactData = WEATHER_IMPACTS[condition] || {};
  const impacts = formatImpacts(impactData);

  const formattedDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const dayOfWeek = date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });

  return {
    date: formattedDate,
    dayOfWeek,
    season,
    condition,
    impacts,
    impactData,
    hasComet: false,
    cometEvent: null,
  };
};

// ----------------------
// Weekly forecast
const getWeeklyForecast = (seasonalWeatherConfig, regionId = "default") => {
  const today = new Date();
  const forecast = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + i
      )
    );
    forecast.push(getWeatherForDate(d, seasonalWeatherConfig, regionId));
  }
  return forecast;
};

// ----------------------
// Current weather
const getWeatherUpdate = (seasonalWeatherConfig, regionId = "default") => {
  return getWeatherForDate(new Date(), seasonalWeatherConfig, regionId);
};

// ----------------------
// Regional helpers
const getRegionalWeatherUpdate = (regionConfig) =>
  getWeatherUpdate(regionConfig.seasonalWeather, regionConfig.id);
const getRegionalWeeklyForecast = (regionConfig) =>
  getWeeklyForecast(regionConfig.seasonalWeather, regionConfig.id);

// ----------------------
// Weather emojis
const getWeatherEmoji = (condition, isNight = false) => {
  switch (condition) {
    case Weather.CLEAR_SKIES:
      return isNight ? "🌙" : "☀️";
    case Weather.LIGHT_RAIN:
      return "🌦️";
    case Weather.HEAVY_RAIN:
      return "🌧️";
    case Weather.STORM:
      return "⛈️";
    case Weather.HOT:
      return "🔥";
    case Weather.HEATWAVE:
      return "🔥";
    case Weather.SNOW:
      return "❄️";
    case Weather.BLIZZARD:
      return "❄️";
    case Weather.FOG:
      return "🌫️";
    default:
      return "🌤️"; // fallback for unknown condition
  }
};

// ----------------------
// Exports
module.exports = {
  Weather,
  ALL_WEATHER_TYPES,
  getWeatherUpdate,
  getWeeklyForecast,
  getWeatherForDate,
  getWeatherEmoji,
  getRegionalWeatherUpdate,
  getRegionalWeeklyForecast,
  WEATHER_IMPACTS,
  isCometDate,
  getCometEventInfo,
  COMET_DATE,
};
