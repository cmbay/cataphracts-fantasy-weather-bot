// Simple seeded random number generator (Mulberry32)
// This ensures deterministic weather based on date and region
function seededRandom(seed) {
  let a = seed ^ 0xdeadbeef; // Change the initial seed to be offset by a constant
  return function () {
    a |= 0;
    a = (a + 0x7f4a7c15) | 0; // Change the increment constant
    let t = Math.imul(a ^ (a >>> 13), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 9), 61 | t)) ^ t; // Change the shift values
    return ((t ^ (t >>> 11)) >>> 0) / 4294967296; // Change the final shift
  };
}

// Generate a seed from a date and region (YYYY-MM-DD format)
function dateToSeed(date, regionId = "default") {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 0-based to 1-based
  const day = date.getUTCDate();

  // Create a unique seed by combining year, month, day, and region
  // Use simple string hash for region to ensure different regions have different weather
  let regionHash = 0;
  for (let i = 0; i < regionId.length; i++) {
    regionHash =
      ((regionHash << 5) - regionHash + regionId.charCodeAt(i)) & 0xffffffff;
  }

  return year * 10000 + month * 100 + day + (regionHash % 1000);
}

// No legacy day/night or derived impacts support

// Determine current season based on date
const getSeason = (date) => {
  const month = date.getUTCMonth() + 1; // getUTCMonth() returns 0-11

  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter"; // December, January, February
};

// Helper: bias selection so earlier items are more likely
function weightedIndex(rng, n, power = 2) {
  if (n <= 0) return 0;
  // u^power biases toward 0 as power increases
  const u = rng();
  const idx = Math.floor(Math.pow(u, power) * n);
  return Math.min(Math.max(idx, 0), n - 1);
}

// No derived impacts function

const getWeatherForDate = (
  date,
  seasonalWeatherConfig,
  regionId = "default"
) => {
  const season = getSeason(date);

  // Require seasonal weather config - no fallback to default
  if (!seasonalWeatherConfig) {
    throw new Error(
      `Seasonal weather configuration is required for region: ${regionId}`
    );
  }

  const seasonData = seasonalWeatherConfig[season];

  if (!seasonData) {
    throw new Error(
      `No weather data found for season '${season}' in region: ${regionId}`
    );
  }

  // Create a seeded random generator based on the date and region
  const seed = dateToSeed(date, regionId);
  const rng = seededRandom(seed);

  // Require a single 'conditions' array only
  if (
    !Array.isArray(seasonData.conditions) ||
    seasonData.conditions.length === 0
  ) {
    throw new Error(
      `No weather conditions defined for season '${season}' in region: ${regionId}`
    );
  }

  // Weighted pick: earlier items more likely
  const conditionIdx = weightedIndex(rng, seasonData.conditions.length, 2);
  const condition = seasonData.conditions[conditionIdx];

  // Impacts: explicit mapping only (no derived fallback)
  let impacts = [];
  if (
    seasonData.mechanicalImpacts &&
    typeof seasonData.mechanicalImpacts === "object"
  ) {
    const mapped = seasonData.mechanicalImpacts[condition];
    if (Array.isArray(mapped)) {
      impacts = mapped.filter((s) => typeof s === "string" && s.trim());
    } else if (typeof mapped === "string" && mapped.trim()) {
      impacts = [mapped];
    }
  }
  // impacts may be empty if not mapped

  // Format date
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  // Get day of week
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
  };
};

const getWeeklyForecast = (seasonalWeatherConfig, regionId = "default") => {
  const today = new Date();
  const forecast = [];

  // Generate forecast for the next 7 days
  for (let i = 0; i < 7; i++) {
    const forecastDate = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + i
    ));
    forecast.push(
      getWeatherForDate(forecastDate, seasonalWeatherConfig, regionId)
    );
  }

  return forecast;
};

const getWeatherUpdate = (seasonalWeatherConfig, regionId = "default") => {
  const currentDate = new Date();
  return getWeatherForDate(currentDate, seasonalWeatherConfig, regionId);
};

// Regional weather functions for easier usage
const getRegionalWeatherUpdate = (regionConfig) => {
  return getWeatherUpdate(regionConfig.seasonalWeather, regionConfig.id);
};

const getRegionalWeeklyForecast = (regionConfig) => {
  return getWeeklyForecast(regionConfig.seasonalWeather, regionConfig.id);
};

// Map weather conditions to appropriate emojis
const getWeatherEmoji = (condition, isNight = false) => {
  const conditionLower = condition.toLowerCase();

  // Snow and ice conditions
  if (conditionLower.includes("snow") || conditionLower.includes("flurries")) {
    return "❄️";
  }
  if (
    conditionLower.includes("icy") ||
    conditionLower.includes("frost") ||
    conditionLower.includes("freezing")
  ) {
    return "🧊";
  }
  if (conditionLower.includes("sleet")) {
    return "🌨️";
  }

  // Rain conditions
  if (
    conditionLower.includes("thunderstorm") ||
    conditionLower.includes("thunder")
  ) {
    return "⛈️";
  }
  if (conditionLower.includes("heavy") && conditionLower.includes("rain")) {
    return "🌧️";
  }
  if (
    conditionLower.includes("rain") ||
    conditionLower.includes("showers") ||
    conditionLower.includes("drizzle")
  ) {
    return "🌦️";
  }

  // Fog and mist
  if (conditionLower.includes("fog") || conditionLower.includes("mist")) {
    return "🌫️";
  }

  // Clear and sunny conditions
  if (
    conditionLower.includes("sunny") ||
    conditionLower.includes("bright") ||
    conditionLower.includes("clear")
  ) {
    if (isNight || conditionLower.includes("starry")) {
      return "🌟";
    }
    return "☀️";
  }

  // Cloudy conditions
  if (conditionLower.includes("overcast") || conditionLower.includes("grey")) {
    return isNight ? "☁️" : "☁️";
  }
  if (
    conditionLower.includes("partly cloudy") ||
    conditionLower.includes("scattered clouds")
  ) {
    return isNight ? "☁️" : "⛅";
  }
  if (conditionLower.includes("cloudy")) {
    return isNight ? "☁️" : "☁️";
  }

  // Windy conditions
  if (conditionLower.includes("blustery") || conditionLower.includes("windy")) {
    return "💨";
  }
  if (conditionLower.includes("breeze")) {
    return "🍃";
  }

  // Hazy conditions
  if (conditionLower.includes("hazy")) {
    return isNight ? "🌙" : "🌤️";
  }

  // Default based on general description
  if (conditionLower.includes("mild") || conditionLower.includes("warm")) {
    return isNight ? "🌙" : "🌤️";
  }
  if (conditionLower.includes("cool") || conditionLower.includes("cold")) {
    return isNight ? "❄️" : "❄️";
  }
  if (conditionLower.includes("hot")) {
    return "🔥";
  }

  // Default emoji
  return isNight ? "🌙" : "🌤️";
};

module.exports = {
  getWeatherUpdate,
  getWeeklyForecast,
  getWeatherForDate,
  getWeatherEmoji,
  getRegionalWeatherUpdate,
  getRegionalWeeklyForecast,
};
