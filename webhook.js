const axios = require("axios");
const {
  getRegionalWeatherUpdate,
  getWeatherEmoji,
} = require("./src/services/weatherService");
const {
  getConfiguredRegions,
  getRegionConfig,
} = require("./src/config/config");
const { updateWeatherTable } = require("./src/services/googleSheetsService");
const { logger } = require("./src/utils/logger");

async function sendRegionalWeatherWebhook(regionId) {
  try {
    // Get region configuration
    const regionConfig = await getRegionConfig(regionId);
    logger.info(`Sending weather update for region: ${regionConfig.name}`);

    // Get weather data for this region (single condition + impacts)
    const weather = getRegionalWeatherUpdate(regionConfig);

    // Build the weather message content
    let messageContent =
      `📅 **Weather Update${
        regionConfig.name ? ` - ${regionConfig.name}` : ""
      }**\n` +
      `**Date:** ${weather.date}\n` +
      `**Season:** ${
        weather.season.charAt(0).toUpperCase() + weather.season.slice(1)
      }\n` +
      `${getWeatherEmoji(weather.condition, false)} **Weather:** ${
        weather.condition
      }\n`;

    // Add mechanical impacts if any
    if (Array.isArray(weather.impacts) && weather.impacts.length > 0) {
      weather.impacts.forEach((impact) => {
        messageContent += `⚠️ ${impact}\n`;
      });
    }

    // Format the message for Discord webhook
    const weatherMessage = {
      content: messageContent,
    };

    // Send to all Discord webhooks for this region
    const results = [];
    for (let i = 0; i < regionConfig.webhookUrls.length; i++) {
      const webhookUrl = regionConfig.webhookUrls[i];
      try {
        const response = await axios.post(webhookUrl, weatherMessage, {
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.status === 204) {
          logger.info(
            `Weather update posted successfully to webhook ${i + 1}/${
              regionConfig.webhookUrls.length
            } for region: ${regionConfig.name}`
          );
          results.push({ webhookIndex: i + 1, success: true });
        } else {
          logger.warn(
            `Unexpected response status: ${response.status} for webhook ${
              i + 1
            } in region: ${regionConfig.name}`
          );
          results.push({
            webhookIndex: i + 1,
            success: false,
            status: response.status,
          });
        }
      } catch (error) {
        logger.error(
          `Failed to send to webhook ${i + 1}/${
            regionConfig.webhookUrls.length
          } for region ${regionId}: ${error.message}`
        );
        results.push({
          webhookIndex: i + 1,
          success: false,
          error: error.message,
        });
      }
    }

    // Check if all webhooks succeeded
    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    if (failed === 0) {
      console.log(
        `✅ Weather update posted successfully to all ${successful} webhook(s) for ${regionConfig.name}!`
      );
    } else {
      console.log(
        `⚠️ Weather update posted to ${successful}/${results.length} webhook(s) for ${regionConfig.name}`
      );
      throw new Error(
        `Failed to post to ${failed} webhook(s) for region ${regionId}`
      );
    }
  } catch (error) {
    logger.error(
      `Failed to send weather webhook for region ${regionId}: ${error.message}`
    );
    console.error(
      `❌ Failed to send weather update for ${regionId}:`,
      error.message
    );
    throw error; // Re-throw to allow caller to handle
  }
}

/**
 * Update weather data in Google Sheets Master Lists table
 * @param {object} weatherByRegionName - Object mapping region name to current weather condition
 */
async function updateGoogleSheetsWeather(weatherByRegionName) {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (!spreadsheetId || !serviceAccountKey) {
    logger.info("Google Sheets not configured, skipping weather table update");
    return;
  }

  try {
    logger.info("Updating weather table in Google Sheets");
    const result = await updateWeatherTable(
      spreadsheetId,
      serviceAccountKey,
      weatherByRegionName
    );
    logger.info(`Updated ${result.updated} weather entries in Google Sheets`);
    console.log(
      `📊 Updated ${result.updated} weather entries in Google Sheets`
    );
  } catch (error) {
    // Log error but don't fail the whole process
    logger.error(
      `Failed to update Google Sheets weather table: ${error.message}`
    );
    console.warn(`⚠️ Failed to update Google Sheets: ${error.message}`);
  }
}

async function sendAllRegionalWebhooks() {
  try {
    const configuredRegions = await getConfiguredRegions();

    if (configuredRegions.length === 0) {
      logger.warn("No regions configured with webhook URLs");
      console.log("⚠️ No regions configured with webhook URLs");
      return;
    }

    logger.info(
      `Sending weather updates for ${configuredRegions.length} regions`
    );

    const results = [];
    const weatherByRegionName = {}; // Collect weather for Google Sheets update, keyed by region name

    for (const region of configuredRegions) {
      try {
        // Get weather data for this region
        const regionConfig = await getRegionConfig(region.id);
        const weather = getRegionalWeatherUpdate(regionConfig);

        // Store for Google Sheets update, using region name as key
        weatherByRegionName[regionConfig.name] = weather.condition;

        await sendRegionalWeatherWebhook(region.id);
        results.push({ regionId: region.id, success: true });
      } catch (error) {
        results.push({
          regionId: region.id,
          success: false,
          error: error.message,
        });
      }
    }

    // Update Google Sheets with all weather data
    await updateGoogleSheetsWeather(weatherByRegionName);

    // Log summary
    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    if (failed === 0) {
      logger.info(
        `All ${successful} regional weather updates sent successfully`
      );
      console.log(
        `✅ All ${successful} regional weather updates sent successfully!`
      );
    } else {
      logger.warn(
        `${successful} successful, ${failed} failed regional weather updates`
      );
      console.log(
        `⚠️ ${successful} successful, ${failed} failed regional weather updates`
      );

      // Log failures
      results
        .filter((r) => !r.success)
        .forEach((result) => {
          logger.error(`Failed region ${result.regionId}: ${result.error}`);
        });
    }

    // Exit with error code if any failed
    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Failed to send regional webhooks: ${error.message}`);
    console.error("❌ Failed to send regional webhooks:", error.message);
    process.exit(1);
  }
}

// If this script is run directly (not imported)
if (require.main === module) {
  // Check if a specific region was provided as argument
  const regionId = process.argv[2];

  if (regionId) {
    sendRegionalWeatherWebhook(regionId);
  } else {
    sendAllRegionalWebhooks();
  }
}

module.exports = {
  sendRegionalWeatherWebhook,
  sendAllRegionalWebhooks,
};
