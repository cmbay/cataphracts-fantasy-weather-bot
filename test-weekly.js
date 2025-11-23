const {
  getRegionalWeeklyForecast,
  getWeatherEmoji,
} = require("./src/services/weatherService");
const {
  getConfiguredRegions,
  getRegionConfig,
  getWeeklyForecastWebhookUrl,
} = require("./src/config/config");
const { logger } = require("./src/utils/logger");

// Mock webhook function for testing
async function mockSendDiscordMessage(webhookUrl, content) {
  const MAX_DISCORD_LENGTH = 2000;

  console.log(`\n🔧 MOCK WEEKLY WEBHOOK SEND`);
  console.log(`📡 Webhook URL: ${webhookUrl}`);
  console.log(`📏 Content Length: ${content.length} characters`);

  if (content.length > MAX_DISCORD_LENGTH) {
    console.log(`⚠️ Content would be split into multiple messages`);
    const messageCount = Math.ceil(content.length / MAX_DISCORD_LENGTH);
    console.log(`📨 Would send ${messageCount} messages`);
  } else {
    console.log(`📨 Would send 1 message`);
  }

  console.log("📝 Message Content:");
  console.log("─".repeat(50));
  console.log(content);
  console.log("─".repeat(50));

  return [{ status: 204 }]; // Mock successful response
}

async function testConsolidatedWeeklyForecastWebhook() {
  try {
    // Get weekly forecast webhook URL
    const weeklyForecastUrl = await getWeeklyForecastWebhookUrl();

    // If no weekly forecast URL configured, use a mock URL for testing
    const mockWeeklyUrl =
      weeklyForecastUrl ||
      "https://discord.com/api/webhooks/EXAMPLE_WEEKLY_WEBHOOK/test";

    if (!weeklyForecastUrl) {
      console.log(
        "⚠️ No weekly forecast webhook URL configured, using mock URL for testing"
      );
    }

    // Get configured regions from the merged config system
    const configuredRegions = await getConfiguredRegions();

    if (configuredRegions.length === 0) {
      logger.warn("No regions configured with webhook URLs");
      console.log("⚠️ No regions configured with webhook URLs");
      return;
    }

    logger.info(
      `Testing consolidated weekly forecast for ${configuredRegions.length} regions`
    );

    // Build consolidated forecast message
    let consolidatedMessage =
      "📅 **Weekly Weather Forecast - All Regions**\n\n";

    for (const region of configuredRegions) {
      try {
        const regionConfig = await getRegionConfig(region.id);

        const weeklyForecast = getRegionalWeeklyForecast(regionConfig);

        if (regionConfig.name) {
          consolidatedMessage += `🌍 **${regionConfig.name}**\n\n`;
        }

        weeklyForecast.forEach((dayWeather, index) => {
          const isToday = index === 0;
          const dayLabel = isToday ? "Today" : dayWeather.dayOfWeek;
          consolidatedMessage +=
            `**${dayLabel} - ${dayWeather.date}**\n` +
            `Season: ${
              dayWeather.season.charAt(0).toUpperCase() +
              dayWeather.season.slice(1)
            }\n` +
            `${getWeatherEmoji(dayWeather.condition, false)} Weather: ${
              dayWeather.condition
            }\n`;

          // Add mechanical impacts if any
          if (Array.isArray(dayWeather.impacts) && dayWeather.impacts.length) {
            dayWeather.impacts.forEach((impact) => {
              consolidatedMessage += `⚠️ ${impact}\n`;
            });
          }

          consolidatedMessage += `\n`;
        });

        consolidatedMessage += "─────────────────────────────\n\n";
      } catch (error) {
        logger.error(
          `TEST: Failed to generate forecast for region ${region.id}: ${error.message}`
        );
        consolidatedMessage += `🌍 **${region.name || region.id}**\n`;
        consolidatedMessage += `❌ *Error generating forecast for this region*\n\n`;
        consolidatedMessage += "─────────────────────────────\n\n";
      }
    }

    // Add footer
    consolidatedMessage +=
      "*Consolidated weather forecast for all campaign regions*";

    // Send message(s) to mock Discord webhook
    const responses = await mockSendDiscordMessage(
      mockWeeklyUrl,
      consolidatedMessage
    );

    // Check all responses
    const allSuccessful = responses.every(
      (response) => response.status === 204
    );

    if (allSuccessful) {
      const messageCount = responses.length;
      logger.info(
        `TEST: Consolidated weekly weather forecast would be posted successfully (${messageCount} message${
          messageCount > 1 ? "s" : ""
        })`
      );
      console.log(
        `✅ TEST: Consolidated weekly weather forecast would be posted successfully (${messageCount} message${
          messageCount > 1 ? "s" : ""
        })!`
      );
    }
  } catch (error) {
    logger.error(
      `TEST: Failed to send consolidated weekly forecast webhook: ${error.message}`
    );
    console.error(
      "❌ TEST: Failed to send consolidated weekly forecast:",
      error.message
    );
  }
}

async function testAllRegionalWeeklyForecasts() {
  try {
    logger.info("Testing consolidated weekly forecast for all regions");
    await testConsolidatedWeeklyForecastWebhook();
  } catch (error) {
    logger.error(`TEST: Failed to send weekly forecast: ${error.message}`);
    console.error("❌ TEST: Failed to send weekly forecast:", error.message);
  }
}

// If this script is run directly
if (require.main === module) {
  testAllRegionalWeeklyForecasts();
}

module.exports = {
  testAllRegionalWeeklyForecasts,
  testConsolidatedWeeklyForecastWebhook,
};
