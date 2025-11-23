require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { fetchAllConfig } = require("../services/googleSheetsService");

// Generic function to load a JSON config file with flexible file discovery
const loadConfig = (envVarName, fileName, exampleFileName) => {
  // 1. Try to load from environment variable (for GitHub Actions)
  if (process.env[envVarName]) {
    try {
      const config = JSON.parse(process.env[envVarName]);
      console.log(
        `[CONFIG] Loaded ${fileName} from ${envVarName} environment variable`
      );
      return config;
    } catch (error) {
      console.warn(
        `[CONFIG] Failed to parse ${envVarName} environment variable: ${error.message}`
      );
    }
  }

  // 2. Priority order for configuration files
  const possiblePaths = [
    // Custom user file (highest priority)
    path.join(process.cwd(), fileName),
    path.join(process.cwd(), "config", fileName),
    path.join(process.cwd(), "src", "config", fileName),

    // Default example file (fallback)
    path.join(__dirname, fileName),
    path.join(__dirname, exampleFileName),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        console.log(`[CONFIG] Loaded ${fileName} from: ${configPath}`);
        return config;
      }
    } catch (error) {
      console.warn(
        `[CONFIG] Failed to load ${fileName} from ${configPath}: ${error.message}`
      );
    }
  }

  // No config file found - return empty config
  console.log(`[CONFIG] No ${fileName} configuration found`);
  return null;
};

// Configuration loading state
let configLoaded = false;
let configLoadPromise = null;

// Google Sheets configuration
const GOOGLE_SERVICE_ACCOUNT_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

// Storage for dynamically loaded config
let channelsConfig = { channels: {} };
let channelAssignments = { assignments: {}, weeklyForecastChannel: null };

// Load regions config as before (from environment variable or file)
const regionsConfig = loadConfig(
  "REGIONS_CONFIG",
  "regions.json",
  "regions-example.json"
) || { regions: {} };

/**
 * Load file-based configuration as fallback
 */
function loadFileBasedConfig() {
  channelsConfig = loadConfig(
    "CHANNELS_CONFIG",
    "channels.json",
    "channels-example.json"
  ) || { channels: {} };

  channelAssignments = loadConfig(
    "CHANNEL_ASSIGNMENTS_CONFIG",
    "channel-assignments.json",
    "channel-assignments-example.json"
  ) || { assignments: {}, weeklyForecastChannel: null };
}

/**
 * Load channels and channel assignments from Google Sheets
 * Falls back to file-based config if Google Sheets is not configured or fails
 * This function is called once and caches the result
 */
async function loadGoogleSheetsConfig() {
  // Return cached promise if already loading
  if (configLoadPromise) {
    return configLoadPromise;
  }

  // Return immediately if already loaded
  if (configLoaded) {
    return;
  }

  // Create loading promise to prevent concurrent calls
  configLoadPromise = (async () => {
    // Check if Google Sheets is configured
    if (!GOOGLE_SERVICE_ACCOUNT_KEY || !GOOGLE_SPREADSHEET_ID) {
      console.log(
        "[CONFIG] Google Sheets not configured, using file-based config"
      );
      loadFileBasedConfig();
      configLoaded = true;
      return;
    }

    // Try to load from Google Sheets
    try {
      console.log("[CONFIG] Loading configuration from Google Sheets");
      const {
        channelsConfig: loadedChannels,
        assignmentsConfig: loadedAssignments,
      } = await fetchAllConfig(
        GOOGLE_SPREADSHEET_ID,
        GOOGLE_SERVICE_ACCOUNT_KEY
      );

      channelsConfig = loadedChannels;
      channelAssignments = loadedAssignments;

      console.log(
        `[CONFIG] Successfully loaded ${
          Object.keys(channelsConfig.channels || {}).length
        } channels from Google Sheets`
      );
    } catch (error) {
      console.error(
        `[CONFIG] Failed to load from Google Sheets: ${error.message}`
      );
      console.log("[CONFIG] Falling back to file-based configuration");
      loadFileBasedConfig();
    }

    configLoaded = true;
  })();

  await configLoadPromise;
  configLoadPromise = null;
}

// Merge configurations: resolve channel IDs to webhook URLs for each region
async function mergeConfigurations() {
  // Ensure config is loaded
  await loadGoogleSheetsConfig();

  const merged = { regions: {} };

  // For each region in regions.json
  Object.entries(regionsConfig.regions || {}).forEach(
    ([regionId, regionData]) => {
      // Get channel assignments for this region
      const assignments = channelAssignments.assignments[regionId] || {};

      // Resolve channel IDs to webhook URLs
      const webhookUrls = (assignments.channels || [])
        .map((channelId) => {
          const channel = channelsConfig.channels[channelId];
          if (!channel || !channel.webhookUrl) {
            console.warn(
              `[CONFIG] Channel '${channelId}' not found in channels config for region '${regionId}'`
            );
            return null;
          }
          return channel.webhookUrl;
        })
        .filter((url) => url); // Remove null values

      // Merge region data with resolved webhook URLs
      merged.regions[regionId] = {
        ...regionData,
        id: regionId,
        webhookUrls,
      };
    }
  );

  return merged;
}

// Merged configuration cache
let mergedConfig = null;

// Build simplified config - only need the weekly forecast webhook URL
const config = {
  // Consolidated weekly forecast webhook (all regions in one channel)
  // This can be overridden by WEEKLY_FORECAST_WEBHOOK_URL environment variable
  // or derived from channelAssignments.weeklyForecastChannel
  WEEKLY_FORECAST_WEBHOOK_URL: process.env.WEEKLY_FORECAST_WEBHOOK_URL,
};

// Helper to get weekly forecast URL (async to ensure config is loaded)
async function getWeeklyForecastWebhookUrlInternal() {
  await loadGoogleSheetsConfig();

  // If env var is set, use that
  if (config.WEEKLY_FORECAST_WEBHOOK_URL) {
    return config.WEEKLY_FORECAST_WEBHOOK_URL;
  }

  // Otherwise, try to resolve from channel assignments
  if (channelAssignments.weeklyForecastChannel) {
    const weeklyChannel =
      channelsConfig.channels[channelAssignments.weeklyForecastChannel];
    if (weeklyChannel && weeklyChannel.webhookUrl) {
      console.log(
        `[CONFIG] Using weekly forecast channel: ${channelAssignments.weeklyForecastChannel}`
      );
      return weeklyChannel.webhookUrl;
    }
  }

  return null;
}

// Function to validate specific environment variables
const validateConfig = (requiredVars = [], optionalVars = []) => {
  for (const varName of requiredVars) {
    if (!config[varName]) {
      console.error(`Missing required environment variable: ${varName}`);
      process.exit(1);
    }
  }

  // Warn about optional variables
  for (const varName of optionalVars) {
    if (!config[varName]) {
      console.warn(`Optional environment variable not set: ${varName}`);
    }
  }
};

// Function to get all configured regions
const getConfiguredRegions = async () => {
  // Ensure config is loaded and merged
  if (!mergedConfig) {
    mergedConfig = await mergeConfigurations();
  }

  if (!mergedConfig.regions) return [];

  return Object.entries(mergedConfig.regions)
    .filter(([_, region]) => {
      // Region must have at least one webhook URL configured
      return Array.isArray(region.webhookUrls) && region.webhookUrls.length > 0;
    })
    .map(([regionId, region]) => ({
      id: regionId,
      ...region,
    }));
};

// Function to get a specific region configuration
const getRegionConfig = async (regionId) => {
  // Ensure config is loaded and merged
  if (!mergedConfig) {
    mergedConfig = await mergeConfigurations();
  }

  if (!mergedConfig.regions || !mergedConfig.regions[regionId]) {
    throw new Error(`Region '${regionId}' not found in configuration`);
  }

  const region = mergedConfig.regions[regionId];

  // Normalize webhookUrls to always be an array
  let webhookUrls = [];
  if (Array.isArray(region.webhookUrls)) {
    webhookUrls = region.webhookUrls.filter(
      (url) => url && typeof url === "string"
    );
  }

  // Check if any webhook URLs are configured
  if (webhookUrls.length === 0) {
    throw new Error(`No webhook URLs configured for region '${regionId}'`);
  }

  return {
    id: regionId,
    ...region,
    webhookUrls, // Always provide as array for consistent interface
  };
};

// Function to get the consolidated weekly forecast webhook URL
const getWeeklyForecastWebhookUrl = async () => {
  return await getWeeklyForecastWebhookUrlInternal();
};

// Function to validate region webhook configuration
const validateRegionConfig = async (regionId) => {
  const region = await getRegionConfig(regionId);

  if (!region.webhookUrls || region.webhookUrls.length === 0) {
    throw new Error(`No webhook URLs configured for region '${regionId}'`);
  }

  return region;
};

// Function to validate a custom region definition
const validateRegionDefinition = (regionId, regionData) => {
  const errors = [];

  // Check required fields
  if (!regionData.name) {
    errors.push(`Region '${regionId}' missing required field: name`);
  }

  // Check seasonal weather structure
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
      // Require single 'conditions' array only
      if (!Array.isArray(seasonData.conditions)) {
        errors.push(
          `Region '${regionId}' season '${season}' must define a 'conditions' array`
        );
      } else if (seasonData.conditions.length === 0) {
        errors.push(
          `Region '${regionId}' season '${season}' conditions cannot be empty`
        );
      }

      // Validate mechanicalImpacts if it exists (optional) against 'conditions'
      if (seasonData.mechanicalImpacts) {
        if (
          typeof seasonData.mechanicalImpacts !== "object" ||
          Array.isArray(seasonData.mechanicalImpacts)
        ) {
          errors.push(
            `Region '${regionId}' season '${season}' mechanicalImpacts must be an object`
          );
        } else {
          const known = new Set(seasonData.conditions || []);
          Object.keys(seasonData.mechanicalImpacts).forEach((condition) => {
            if (!known.has(condition)) {
              errors.push(
                `Region '${regionId}' season '${season}' mechanicalImpacts references unknown condition: '${condition}'`
              );
            }
          });
        }
      }
    }
  }

  return errors;
};

// Function to validate all regions in the current configuration
const validateAllRegions = () => {
  const allErrors = [];

  if (!regionsConfig.regions) {
    return ["No regions configuration found"];
  }

  Object.entries(regionsConfig.regions).forEach(([regionId, regionData]) => {
    const errors = validateRegionDefinition(regionId, regionData);
    allErrors.push(...errors);
  });

  return allErrors;
};

// Function to create a region template
const createRegionTemplate = (regionId, regionName) => {
  return {
    name: regionName,
    seasonalWeather: {
      spring: {
        conditions: [
          "Mild spring weather",
          "Pleasant spring day",
          "Spring showers",
          "Warming temperatures",
          "Fresh spring air",
        ],
      },
      summer: {
        conditions: [
          "Warm summer day",
          "Hot and sunny",
          "Summer heat",
          "Bright summer weather",
          "Intense summer sun",
        ],
      },
      autumn: {
        conditions: [
          "Crisp autumn day",
          "Fall weather",
          "Changing seasons",
          "Autumn breeze",
          "Cool autumn temperatures",
        ],
      },
      winter: {
        conditions: [
          "Cold winter day",
          "Winter chill",
          "Freezing temperatures",
          "Winter weather",
          "Harsh winter conditions",
        ],
      },
    },
  };
};

// Function to get regions file path (for saving custom regions)
const getRegionsFilePath = () => {
  const customPath = path.join(process.cwd(), "regions.json");
  return customPath;
};

module.exports = {
  config,
  validateConfig,
  regionsConfig,
  getConfiguredRegions,
  getRegionConfig,
  validateRegionConfig,
  getWeeklyForecastWebhookUrl,
  validateRegionDefinition,
  validateAllRegions,
  createRegionTemplate,
  getRegionsFilePath,
};
