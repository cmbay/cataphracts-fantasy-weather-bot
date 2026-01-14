// weather.js

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
// Generate a seed from date and region (YYYY-MM-DD)
function dateToSeed(date, regionId = "default") {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  let regionHash = 0;
  for (let i = 0; i < regionId.length; i++) {
    regionHash =
      ((regionHash << 5) - regionHash + regionId.charCodeAt(i)) & 0xffffffff;
  }

  return year * 10000 + month * 100 + day + (regionHash % 1000);
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
  "Clear Skies": {
    roadMult: 1,
    offRoadMult: 1,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special: "",
  },
  "Light Rain": {
    roadMult: 1,
    offRoadMult: 1,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special: "",
  },
  "Heavy Rain": {
    roadMult: 0.75,
    offRoadMult: 0.5,
    canForcedMarch: true,
    canNightMarch: false,
    zeroVisibility: false,
    canFordRivers: false,
    type: "Bad",
    special: "",
  },
  Storm: {
    roadMult: 0.5,
    offRoadMult: 0.25,
    canForcedMarch: false,
    canNightMarch: false,
    zeroVisibility: false,
    canFordRivers: false,
    type: "Very Bad",
    special: "",
  },
  Hot: {
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
  Heatwave: {
    roadMult: 0.75,
    offRoadMult: 0.5,
    canForcedMarch: false,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "None",
    special: "Day Marching gives -1 Morale. Night Marching is fine.",
  },
  Snow: {
    roadMult: 0.75,
    offRoadMult: 0.5,
    canForcedMarch: true,
    canNightMarch: true,
    zeroVisibility: false,
    canFordRivers: true,
    type: "Bad",
    special: "",
  },
  Blizzard: {
    roadMult: 0.25,
    offRoadMult: 0,
    canForcedMarch: false,
    canNightMarch: false,
    zeroVisibility: true,
    canFordRivers: false,
    type: "Very Bad",
    special: "Marching gives -1 Morale.",
  },
  Fog: {
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
// Main function: weather for a date
const getWeatherForDate = (
  date,
  seasonalWeatherConfig,
  regionId = "default"
) => {
  const season = getSeason(date);
  const seasonData = seasonalWeatherConfig[season];
  if (!seasonData) throw new Error(`No weather data for season '${season}'`);

  const seed = dateToSeed(date, regionId);
  const rng = seededRandom(seed);

  const condition = rollFromTable(rng, seasonData.conditions);
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
    case "Clear Skies":
      return isNight ? "🌙" : "☀️";
    case "Light Rain":
      return "🌦️";
    case "Heavy Rain":
      return "🌧️";
    case "Storm":
      return "⛈️";
    case "Hot":
      return "🔥";
    case "Heatwave":
      return "🔥";
    case "Snow":
      return "❄️";
    case "Blizzard":
      return "❄️";
    case "Fog":
      return "🌫️";
    default:
      return "🌤️"; // fallback for unknown condition
  }
};

// ----------------------
// Exports
module.exports = {
  getWeatherUpdate,
  getWeeklyForecast,
  getWeatherForDate,
  getWeatherEmoji,
  getRegionalWeatherUpdate,
  getRegionalWeeklyForecast,
  WEATHER_IMPACTS,
};
