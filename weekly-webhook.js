const axios = require("axios");
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

async function sendAllRegionalWeeklyForecasts() {
  try {
    // Check if consolidated weekly forecast webhook is configured
    const weeklyForecastUrl = await getWeeklyForecastWebhookUrl();

    if (!weeklyForecastUrl) {
      logger.error(
        "WEEKLY_FORECAST_WEBHOOK_URL not configured. Weekly forecast cannot be sent."
      );
      console.error(
        "❌ WEEKLY_FORECAST_WEBHOOK_URL not configured. Weekly forecast cannot be sent."
      );
      process.exit(1);
    }

    // Use consolidated approach - send all regions to one channel
    logger.info("Sending consolidated weekly forecast for all regions");
    await sendConsolidatedWeeklyForecastWebhook();
  } catch (error) {
    logger.error(`Failed to send weekly forecast: ${error.message}`);
    console.error("❌ Failed to send weekly forecast:", error.message);
    process.exit(1);
  }
}

// Helper function to send multiple Discord messages if content exceeds character limit
async function sendDiscordMessage(webhookUrl, content) {
  const MAX_DISCORD_LENGTH = 2000;

  if (content.length <= MAX_DISCORD_LENGTH) {
    // Content fits in one message
    const response = await axios.post(
      webhookUrl,
      { content },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    return [response];
  }

  // Need to split into multiple messages
  const messages = [];
  let currentMessage = "";
  const lines = content.split("\n");

  for (const line of lines) {
    // Check if adding this line would exceed the limit
    const testMessage = currentMessage + (currentMessage ? "\n" : "") + line;

    if (testMessage.length > MAX_DISCORD_LENGTH) {
      // Send current message if it has content
      if (currentMessage.trim()) {
        messages.push(currentMessage);
      }
      // Start new message with current line
      currentMessage = line;
    } else {
      // Add line to current message
      currentMessage = testMessage;
    }
  }

  // Add final message if it has content
  if (currentMessage.trim()) {
    messages.push(currentMessage);
  }

  // Send all messages
  const responses = [];
  for (let i = 0; i < messages.length; i++) {
    const messageContent = i === 0 ? messages[i] : `${messages[i]}`;
    const response = await axios.post(
      webhookUrl,
      { content: messageContent },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    responses.push(response);

    // Small delay between messages to avoid rate limiting
    if (i < messages.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return responses;
}

async function sendConsolidatedWeeklyForecastWebhook() {
  try {
    const weeklyForecastUrl = await getWeeklyForecastWebhookUrl();

    if (!weeklyForecastUrl) {
      logger.error(
        "WEEKLY_FORECAST_WEBHOOK_URL not configured. Consolidated weekly forecast cannot be sent."
      );
      console.error(
        "❌ WEEKLY_FORECAST_WEBHOOK_URL not configured. Consolidated weekly forecast cannot be sent."
      );
      process.exit(1);
    }

    const configuredRegions = await getConfiguredRegions();

    if (configuredRegions.length === 0) {
      logger.warn("No regions configured with webhook URLs");
      console.log("⚠️ No regions configured with webhook URLs");
      return;
    }

    logger.info(
      `Sending consolidated weekly forecast for ${configuredRegions.length} regions`
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
          `Failed to generate forecast for region ${region.id}: ${error.message}`
        );
        consolidatedMessage += `🌍 **${region.name || region.id}**\n`;
        consolidatedMessage += `❌ *Error generating forecast for this region*\n\n`;
        consolidatedMessage += "─────────────────────────────\n\n";
      }
    }

    // Add footer
    consolidatedMessage +=
      "*Consolidated weather forecast for all campaign regions*";

    // Send message(s) to Discord webhook, splitting if necessary
    const responses = await sendDiscordMessage(
      weeklyForecastUrl,
      consolidatedMessage
    );

    // Check all responses
    const allSuccessful = responses.every(
      (response) => response.status === 204
    );

    if (allSuccessful) {
      const messageCount = responses.length;
      logger.info(
        `Consolidated weekly weather forecast posted successfully (${messageCount} message${
          messageCount > 1 ? "s" : ""
        })`
      );
      console.log(
        `✅ Consolidated weekly weather forecast posted successfully (${messageCount} message${
          messageCount > 1 ? "s" : ""
        })!`
      );
    } else {
      const failedResponses = responses.filter(
        (response) => response.status !== 204
      );
      logger.warn(
        `Some messages failed. Failed responses: ${failedResponses.length}/${responses.length}`
      );
    }
  } catch (error) {
    logger.error(
      `Failed to send consolidated weekly forecast webhook: ${error.message}`
    );
    console.error(
      "❌ Failed to send consolidated weekly forecast:",
      error.message
    );
    process.exit(1);
  }
}

// If this script is run directly (not imported)
if (require.main === module) {
  // Always use consolidated approach
  sendAllRegionalWeeklyForecasts();
}

module.exports = {
  sendAllRegionalWeeklyForecasts,
  sendConsolidatedWeeklyForecastWebhook,
};
