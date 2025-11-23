const {
  getRegionalWeatherUpdate,
  getWeatherEmoji,
} = require("./src/services/weatherService");
const {
  getConfiguredRegions,
  getRegionConfig,
} = require("./src/config/config");
const { logger } = require("./src/utils/logger");

// Mock webhook function for testing
async function mockSendWebhook(regionConfig, messageContent, webhookIndex) {
  console.log(`\n🔧 MOCK WEBHOOK SEND TO: ${regionConfig.name}`);
  console.log(
    `📡 Webhook URL ${webhookIndex}: ${
      regionConfig.webhookUrls[webhookIndex - 1]
    }`
  );
  console.log("📝 Message Content:");
  console.log("─".repeat(50));
  console.log(messageContent);
  console.log("─".repeat(50));
  return { status: 204 }; // Mock successful response
}

async function testRegionalWeatherWebhook(regionId) {
  try {
    // Get region configuration from the merged config system
    const regionConfig = await getRegionConfig(regionId);

    logger.info(`Testing weather update for region: ${regionConfig.name}`);

    // Get weather data for this region
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

    // Send to all mock webhooks for this region
    const results = [];
    for (let i = 0; i < regionConfig.webhookUrls.length; i++) {
      const response = await mockSendWebhook(
        regionConfig,
        messageContent,
        i + 1
      );
      results.push({ webhookIndex: i + 1, success: response.status === 204 });
    }

    const successful = results.filter((r) => r.success).length;
    if (successful === results.length) {
      logger.info(
        `TEST: Weather update would be posted successfully to all ${successful} webhook(s) for region: ${regionConfig.name}`
      );
      console.log(
        `✅ TEST: Weather update would be posted successfully to all ${successful} webhook(s) for ${regionConfig.name}!`
      );
    }
  } catch (error) {
    logger.error(
      `TEST: Failed to send weather webhook for region ${regionId}: ${error.message}`
    );
    console.error(
      `❌ TEST: Failed to send weather update for ${regionId}:`,
      error.message
    );
  }
}

async function testAllRegionalWebhooks() {
  try {
    // Get configured regions from the merged config system
    const configuredRegions = await getConfiguredRegions();

    if (configuredRegions.length === 0) {
      logger.warn("No regions configured with webhook URLs");
      console.log("⚠️ No regions configured with webhook URLs");
      return;
    }

    logger.info(
      `Testing weather updates for ${configuredRegions.length} regions`
    );

    for (const region of configuredRegions) {
      await testRegionalWeatherWebhook(region.id);
    }

    console.log(
      `✅ TEST: All ${configuredRegions.length} regional weather updates tested successfully!`
    );
  } catch (error) {
    logger.error(`TEST: Failed to test regional webhooks: ${error.message}`);
    console.error("❌ TEST: Failed to test regional webhooks:", error.message);
  }
}

// If this script is run directly
if (require.main === module) {
  const regionId = process.argv[2];

  if (regionId) {
    testRegionalWeatherWebhook(regionId);
  } else {
    testAllRegionalWebhooks();
  }
}

module.exports = {
  testRegionalWeatherWebhook,
  testAllRegionalWebhooks,
};
