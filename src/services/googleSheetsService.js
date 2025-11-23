const { google } = require("googleapis");
const { logger } = require("../utils/logger");

/**
 * Google Sheets Service
 * Handles authentication and data fetching from Google Sheets using a service account
 */

let sheetsClient = null;
let isInitialized = false;

/**
 * Initialize the Google Sheets client with service account credentials
 * @param {string} base64Key - Base64-encoded service account key JSON
 * @returns {object} Google Sheets API client
 */
async function initializeClient(base64Key) {
  if (isInitialized && sheetsClient) {
    return sheetsClient;
  }

  try {
    // Decode the base64 service account key
    const keyJson = Buffer.from(base64Key, "base64").toString("utf-8");
    const credentials = JSON.parse(keyJson);

    // Create authentication client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    // Create sheets client
    sheetsClient = google.sheets({ version: "v4", auth });
    isInitialized = true;

    logger.info("Google Sheets client initialized successfully");
    return sheetsClient;
  } catch (error) {
    logger.error(`Failed to initialize Google Sheets client: ${error.message}`);
    throw new Error(`Google Sheets initialization failed: ${error.message}`);
  }
}

/**
 * Fetch channels configuration from Commanders List and Diplomat Database sheets
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} base64Key - Base64-encoded service account key
 * @returns {object} Channels configuration object
 */
async function fetchChannelsConfig(spreadsheetId, base64Key) {
  try {
    const sheets = await initializeClient(base64Key);
    const channels = {};

    // Fetch Commanders List data (Column K: Channel Friendly Name, Column M: Weather Webhook)
    // Starting from row 3
    logger.info("Fetching Commanders List data from Google Sheets");
    const commandersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Commander Database!K3:M", // K and M columns from row 3 onwards
    });

    const commandersRows = commandersResponse.data.values || [];
    logger.info(
      `Retrieved ${commandersRows.length} rows from Commander Database`
    );
    // Process Commanders List data
    // Column K is index 0 (Friendly Name), Column M is index 2 (Webhook URL)
    commandersRows.forEach((row, index) => {
      // Strip surrounding quotes from friendly name if present
      const friendlyName = row[0]?.trim().replace(/^["']+|["']+$/g, "");
      const webhookUrl = row[2]?.trim();

      if (friendlyName && webhookUrl) {
        // Create channel ID from friendly name (lowercase, replace spaces with hyphens)
        const channelId = friendlyName.toLowerCase().replace(/\s+/g, "-");
        channels[channelId] = {
          name: friendlyName,
          webhookUrl: webhookUrl,
        };
        logger.info(`Added channel from Commander Database: ${channelId}`);
      } else {
        logger.warn(
          `Skipping Commander Database row ${
            index + 3
          }: missing name or webhook URL`
        );
      }
    });

    // Fetch Diplomat Database data (Column F: Friendly Name, Column G: Webhook URL)
    // Starting from row 2
    logger.info("Fetching Diplomat Database data from Google Sheets");
    const diplomatResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Diplomat Database!F2:G", // F and G columns from row 2 onwards
    });

    const diplomatRows = diplomatResponse.data.values || [];
    logger.info(`Retrieved ${diplomatRows.length} rows from Diplomat Database`);

    // Process Diplomat Database data
    // Column F is index 0 (Friendly Name), Column G is index 1 (Webhook URL)
    diplomatRows.forEach((row, index) => {
      // Strip surrounding quotes from friendly name if present
      const friendlyName = row[0]?.trim().replace(/^["']+|["']+$/g, "");
      const webhookUrl = row[1]?.trim();

      if (friendlyName && webhookUrl) {
        // Create channel ID from friendly name
        const channelId = friendlyName.toLowerCase().replace(/\s+/g, "-");
        channels[channelId] = {
          name: friendlyName,
          webhookUrl: webhookUrl,
        };
        logger.info(`Added channel from Diplomat Database: ${channelId}`);
      } else {
        logger.warn(
          `Skipping Diplomat Database row ${
            index + 2
          }: missing name or webhook URL`
        );
      }
    });

    const totalChannels = Object.keys(channels).length;
    logger.info(`Total channels configured: ${totalChannels}`);

    return { channels };
  } catch (error) {
    logger.error(`Failed to fetch channels config: ${error.message}`);
    throw new Error(
      `Failed to fetch channels from Google Sheets: ${error.message}`
    );
  }
}

/**
 * Fetch channel assignments configuration from Checklists sheet
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} base64Key - Base64-encoded service account key
 * @returns {object} Channel assignments configuration object
 */
async function fetchChannelAssignmentsConfig(spreadsheetId, base64Key) {
  try {
    const sheets = await initializeClient(base64Key);

    // Fetch data from Checklists sheet, cell range I12:L39
    logger.info("Fetching channel assignments from Checklists sheet (I12:L39)");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Checklists!I12:L39",
    });

    const rows = response.data.values || [];
    logger.info(`Retrieved ${rows.length} rows from Checklists sheet`);

    // The cell range contains JSON-like data that represents channel assignments
    // We need to parse this data into the expected format
    // Assuming the data is structured as JSON or can be joined and parsed

    // Try to parse as a single JSON block (join all cells)
    let assignmentsData;
    try {
      // Join all cells into a single string and try to parse as JSON
      const jsonString = rows.map((row) => row.join("")).join("");
      assignmentsData = JSON.parse(jsonString);
      logger.info("Successfully parsed channel assignments as JSON");
    } catch (parseError) {
      // If that doesn't work, try interpreting the range as a table
      logger.warn(
        "Failed to parse as single JSON, attempting table interpretation"
      );

      // Alternative: assume first row is headers, rest are data
      // This is a fallback and may need adjustment based on actual sheet structure
      throw new Error(
        `Unable to parse channel assignments from Checklists!I12:L39. ` +
          `Expected JSON data in range. Error: ${parseError.message}`
      );
    }

    return assignmentsData;
  } catch (error) {
    logger.error(`Failed to fetch channel assignments: ${error.message}`);
    throw new Error(
      `Failed to fetch channel assignments from Google Sheets: ${error.message}`
    );
  }
}

/**
 * Fetch all configuration from Google Sheets
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} base64Key - Base64-encoded service account key
 * @returns {object} Complete configuration with channels and assignments
 */
async function fetchAllConfig(spreadsheetId, base64Key) {
  try {
    logger.info(
      `Fetching all configuration from Google Sheets: ${spreadsheetId}`
    );

    const [channelsConfig, assignmentsConfig] = await Promise.all([
      fetchChannelsConfig(spreadsheetId, base64Key),
      fetchChannelAssignmentsConfig(spreadsheetId, base64Key),
    ]);

    return {
      channelsConfig,
      assignmentsConfig,
    };
  } catch (error) {
    logger.error(`Failed to fetch configuration: ${error.message}`);
    throw error;
  }
}

module.exports = {
  initializeClient,
  fetchChannelsConfig,
  fetchChannelAssignmentsConfig,
  fetchAllConfig,
};
