require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { fetchWebhookConfig } = require("../services/googleSheetsService");

/**
 * Simplified configuration module
 *
 * - Regions (weather probabilities) are loaded from local regions.json file
 * - Webhook URLs are fetched from Google Sheets (Commander Database + Diplomat Database)
 * - No file fallback - Google Sheets is required
 */

// Google Sheets configuration (required)
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// Cached webhook configuration from Google Sheets
let webhookConfig = null;
let webhookConfigPromise = null;

/**
 * Normalize region IDs by trimming whitespace from keys
 */
function normalizeRegionKeys(config) {
  if (config.regions) {
    const normalizedRegions = {};
    for (const [key, value] of Object.entries(config.regions)) {
      const trimmedKey = key.trim();
      if (trimmedKey !== key) {
        console.log(
          `[CONFIG] Normalized region key: "${key}" -> "${trimmedKey}"`
        );
      }
      normalizedRegions[trimmedKey] = value;
    }
    config.regions = normalizedRegions;
  }
  return config;
}

/**
 * Load regions configuration from environment variable or local file
 * This contains weather probabilities for each region
 */
function loadRegionsConfig() {
  // First, check for REGIONS_CONFIG environment variable (used in GitHub Actions)
  if (process.env.REGIONS_CONFIG) {
    try {
      const config = JSON.parse(process.env.REGIONS_CONFIG);
      console.log("[CONFIG] Loaded regions from REGIONS_CONFIG environment variable");
      return normalizeRegionKeys(config);
    } catch (error) {
      console.error(
        `[CONFIG] Failed to parse REGIONS_CONFIG: ${error.message}`
      );
    }
  }

  // Fall back to local file
  const possiblePaths = [
    path.join(process.cwd(), "regions.json"),
    path.join(process.cwd(), "config", "regions.json"),
    path.join(process.cwd(), "src", "config", "regions.json"),
    path.join(__dirname, "regions.json"),
    path.join(__dirname, "regions-example.json"),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        console.log(`[CONFIG] Loaded regions.json from: ${configPath}`);
        return normalizeRegionKeys(config);
      }
    } catch (error) {
      console.warn(
        `[CONFIG] Failed to load regions from ${configPath}: ${error.message}`
      );
    }
  }

  console.error("[CONFIG] No regions.json configuration found");
  return { regions: {} };
}

// Load regions config on startup
const regionsConfig = loadRegionsConfig();

/**
 * Fetch webhook configuration from Google Sheets
 * Caches the result for subsequent calls
 */
async function loadWebhookConfig() {
  // Return cached result if available
  if (webhookConfig) {
    return webhookConfig;
  }

  // Return in-progress promise if already loading
  if (webhookConfigPromise) {
    return webhookConfigPromise;
  }

  // Validate Google Sheets is configured
  if (!GOOGLE_SERVICE_ACCOUNT_KEY || !GOOGLE_SPREADSHEET_ID) {
    throw new Error(
      "Google Sheets not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_SPREADSHEET_ID environment variables."
    );
  }

  // Fetch from Google Sheets
  webhookConfigPromise = (async () => {
    console.log("[CONFIG] Fetching webhook configuration from Google Sheets");
    webhookConfig = await fetchWebhookConfig(
      GOOGLE_SPREADSHEET_ID,
      GOOGLE_SERVICE_ACCOUNT_KEY
    );
    console.log(
      `[CONFIG] Loaded webhooks for ${
        Object.keys(webhookConfig.webhooksByRegion).length
      } regions`
    );
    return webhookConfig;
  })();

  const result = await webhookConfigPromise;
  webhookConfigPromise = null;
  return result;
}

/**
 * Get all configured regions that have both:
 * - Weather probabilities defined in regions.json
 * - At least one webhook URL from Google Sheets
 *
 * Also includes regions from Google Sheets that don't have weather config
 * (these will post warnings about unknown region)
 */
async function getConfiguredRegions() {
  const config = await loadWebhookConfig();

  const regions = [];

  // Include all regions from Google Sheets that have webhooks
  for (const [regionId, webhookUrls] of Object.entries(
    config.webhooksByRegion
  )) {
    if (webhookUrls && webhookUrls.length > 0) {
      const hasWeatherConfig =
        regionsConfig.regions && regionsConfig.regions[regionId];
      regions.push({
        id: regionId,
        name: hasWeatherConfig
          ? regionsConfig.regions[regionId].name
          : regionId,
        webhookUrls,
        hasWeatherConfig,
      });
    }
  }

  return regions;
}

/**
 * Get configuration for a specific region
 * Combines weather config from regions.json with webhooks from Google Sheets
 */
async function getRegionConfig(regionId) {
  const config = await loadWebhookConfig();

  // Get webhooks for this region
  const webhookUrls = config.webhooksByRegion[regionId] || [];

  if (webhookUrls.length === 0) {
    throw new Error(`No webhook URLs configured for region '${regionId}'`);
  }

  // Get weather config (may be undefined for unknown regions)
  const weatherConfig = regionsConfig.regions
    ? regionsConfig.regions[regionId]
    : null;

  return {
    id: regionId,
    name: weatherConfig ? weatherConfig.name : regionId,
    seasonalWeather: weatherConfig ? weatherConfig.seasonalWeather : null,
    webhookUrls,
    hasWeatherConfig: !!weatherConfig,
  };
}

/**
 * Get the weekly forecast webhook URL
 */
async function getWeeklyForecastWebhookUrl() {
  const config = await loadWebhookConfig();
  return config.weeklyForecastUrl;
}

/**
 * Validate a region definition structure
 */
function validateRegionDefinition(regionId, regionData) {
  const errors = [];

  if (!regionData.name) {
    errors.push(`Region '${regionId}' missing required field: name`);
  }

  if (!regionData.seasonalWeather) {
    errors.push(`Region '${regionId}' missing required field: seasonalWeather`);
  } else {
    const requiredSeasons = ["spring", "summer", "autumn", "winter"];
    const seasons = Object.keys(regionData.seasonalWeather);

    for (const season of requiredSeasons) {
      if (!seasons.includes(season)) {
        errors.push(`Region '${regionId}' missing season: ${season}`);
        continue;
      }

      const seasonData = regionData.seasonalWeather[season];
      if (!Array.isArray(seasonData.conditions)) {
        errors.push(
          `Region '${regionId}' season '${season}' must define a 'conditions' array`
        );
      } else if (seasonData.conditions.length === 0) {
        errors.push(
          `Region '${regionId}' season '${season}' conditions cannot be empty`
        );
      }
    }
  }

  return errors;
}

/**
 * Validate all regions in the current configuration
 */
function validateAllRegions() {
  const allErrors = [];

  if (!regionsConfig.regions) {
    return ["No regions configuration found"];
  }

  Object.entries(regionsConfig.regions).forEach(([regionId, regionData]) => {
    const errors = validateRegionDefinition(regionId, regionData);
    allErrors.push(...errors);
  });

  return allErrors;
}

/**
 * Get path for saving custom regions file
 */
function getRegionsFilePath() {
  return path.join(process.cwd(), "regions.json");
}

// Export simplified configuration
module.exports = {
  regionsConfig,
  getConfiguredRegions,
  getRegionConfig,
  getWeeklyForecastWebhookUrl,
  validateRegionDefinition,
  validateAllRegions,
  getRegionsFilePath,
  // For Google Sheets integration
  GOOGLE_SPREADSHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_KEY,
};
