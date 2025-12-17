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
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
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

    // Fetch Commanders List data
    logger.info("Fetching Commanders List data from Google Sheets");
    const commandersResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Commander Database",
    });

    const commandersRows = commandersResponse.data.values || [];
    logger.info(
      `Retrieved ${Math.max(
        0,
        commandersRows.length - 1
      )} rows from Commander Database`
    );

    // Extract header row
    const commanderHeader = commandersRows[0] || [];
    const commanderData = commandersRows.slice(2 - 1); // still start at row 3

    // Find header indices using helper function
    const cmdNameIdx = findColumnIndex(
      commanderHeader,
      "Channel Friendly Name"
    );
    const cmdWebhookIdx = findColumnIndex(commanderHeader, "Weather Webhook");

    commanderData.forEach((row, index) => {
      const friendlyName = row[cmdNameIdx]
        ?.trim()
        .replace(/^["']+|["']+$/g, "");
      const webhookUrl = row[cmdWebhookIdx]?.trim();

      if (friendlyName && webhookUrl) {
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

    // Fetch Diplomat Database data (using column names)
    logger.info("Fetching Diplomat Database data from Google Sheets");
    const diplomatResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Diplomat Database",
    });

    const diplomatRows = diplomatResponse.data.values || [];
    logger.info(
      `Retrieved ${Math.max(
        0,
        diplomatRows.length - 1
      )} rows from Diplomat Database`
    );

    const dipHeader = diplomatRows[0] || [];
    const diplomatData = diplomatRows.slice(1); // still start from row 2

    // Diplomat uses the SAME headers - find using helper function
    const dipNameIdx = findColumnIndex(dipHeader, "Channel Friendly Name");
    const dipWebhookIdx = findColumnIndex(dipHeader, "Weather Webhook");

    diplomatData.forEach((row, index) => {
      const friendlyName = row[dipNameIdx]
        ?.trim()
        .replace(/^["']+|["']+$/g, "");
      const webhookUrl = row[dipWebhookIdx]?.trim();

      if (friendlyName && webhookUrl) {
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
 * Fetch channel assignments configuration from WeatherLocations sheet
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} base64Key - Base64-encoded service account key
 * @returns {object} Channel assignments configuration object
 */
async function fetchChannelAssignmentsConfig(spreadsheetId, base64Key) {
  try {
    const sheets = await initializeClient(base64Key);

    // Fetch data from WeatherLocations sheet, cell range A2:D29
    logger.info("Fetching channel assignments from WeatherLocations sheet (A2:D29)");
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "WeatherLocations!A2:D29",
    });

    const rows = response.data.values || [];
    logger.info(`Retrieved ${rows.length} rows from WeatherLocations sheet`);

    // The cell range contains JSON-like data that represents channel assignments
    // We need to parse this data into the expected format
    // Assuming the data is structured as JSON or can be joined and parsed

    // Try to parse as a single JSON block (join all cells)
    let assignmentsData;
    try {
      // For merged cells, the value is only in the first cell of the merge
      // Get the first non-empty value from the range
      const jsonString = rows.flatMap((row) => row.filter((cell) => cell && cell.trim())).join("");
      logger.info(`Attempting to parse JSON string (length: ${jsonString.length})`);
      assignmentsData = JSON.parse(jsonString);
      logger.info("Successfully parsed channel assignments as JSON");
    } catch (parseError) {
      // If that doesn't work, try interpreting the range as a table
      logger.warn(
        "Failed to parse as single JSON, attempting table interpretation"
      );
      logger.error(`JSON parse error: ${parseError.message}`);
      logger.error(`First 500 chars of string: ${rows.flatMap((row) => row.filter((cell) => cell && cell.trim())).join("").substring(0, 500)}`);

      // Alternative: assume first row is headers, rest are data
      // This is a fallback and may need adjustment based on actual sheet structure
      throw new Error(
        `Unable to parse channel assignments from WeatherLocations!A2:D29. ` +
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

/**
 * Update weather data in the Master Lists sheet
 * Finds the weather table by looking for headers (region_id, name, Current Weather)
 * and updates the Current Weather column for each region
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} base64Key - Base64-encoded service account key
 * @param {object} weatherByRegionName - Object mapping region name to current weather condition
 * @returns {object} Result with updated count
 */
async function updateWeatherTable(spreadsheetId, base64Key, weatherByRegionName) {
  try {
    const sheets = await initializeClient(base64Key);

    // Read a targeted range where the weather table is expected (rows 15-50)
    // This is much more efficient than reading the entire sheet
    logger.info(
      "Reading Master Lists sheet to find weather table (rows 15-50)"
    );
    const headerSearchResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: "Master Lists!A15:Z50",
    });

    const headerRows = headerSearchResponse.data.values || [];
    if (headerRows.length === 0) {
      throw new Error("No data found in Master Lists rows 15-50");
    }

    // Find the header row with name and Current Weather columns
    let headerRowIndex = -1;
    let nameColIndex = -1;
    let weatherColIndex = -1;
    const startRow = 15; // Offset since we started reading from row 15

    for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
      const row = headerRows[rowIdx];
      nameColIndex = findColumnIndex(row, "name");

      if (nameColIndex !== -1) {
        // Found name header, now look for Current Weather in same row
        weatherColIndex = findColumnIndex(row, "current weather");

        if (weatherColIndex !== -1) {
          headerRowIndex = rowIdx + startRow - 1; // Adjust to 0-based sheet index
          logger.info(
            `Found weather table headers at row ${headerRowIndex + 1}, ` +
              `name col ${nameColIndex + 1}, weather col ${
                weatherColIndex + 1
              }`
          );
          break;
        }
      }
    }

    if (
      headerRowIndex === -1 ||
      nameColIndex === -1 ||
      weatherColIndex === -1
    ) {
      throw new Error(
        "Could not find weather table headers (name, Current Weather) in Master Lists rows 15-50"
      );
    }

    // Now read the data rows starting from the header row
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Master Lists!A${headerRowIndex + 2}:Z`, // Start from row after header
    });

    const dataRows = dataResponse.data.values || [];

    // Build batch update data - collect all weather updates
    const updates = [];
    let updatedCount = 0;

    // Iterate through data rows
    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      const actualSheetRow = headerRowIndex + 2 + rowIdx; // Actual row number in sheet (1-based)
      // Get region name and remove surrounding quotes if present
      const regionName = (row[nameColIndex] || "")
        .toString()
        .trim()
        .replace(/^["']+|["']+$/g, "");

      // Stop if we hit an empty name (end of table)
      if (!regionName) {
        break;
      }

      // Only update if we have weather data for this region
      if (weatherByRegionName[regionName]) {
        const weather = weatherByRegionName[regionName];
        // Convert to A1 notation - column letter(s) and row number (1-indexed)
        const colLetter = columnToLetter(weatherColIndex);
        const cellRange = `Master Lists!${colLetter}${actualSheetRow}`;

        updates.push({
          range: cellRange,
          values: [[weather]],
        });
        updatedCount++;
        logger.info(`Queued weather update for region "${regionName}": ${weather}`);
      }
    }

    if (updates.length === 0) {
      logger.warn("No weather updates to apply");
      return { updated: 0 };
    }

    // Perform batch update
    logger.info(`Applying batch update for ${updates.length} weather cells`);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: updates,
      },
    });

    logger.info(
      `Successfully updated ${updatedCount} weather entries in Master Lists`
    );
    return { updated: updatedCount };
  } catch (error) {
    logger.error(`Failed to update weather table: ${error.message}`);
    throw new Error(
      `Failed to update weather table in Google Sheets: ${error.message}`
    );
  }
}

/**
 * Find column index by header name in a row (case-insensitive)
 * @param {Array} headerRow - Array of header cell values
 * @param {string} headerName - Header name to find
 * @returns {number} Column index or -1 if not found
 */
function findColumnIndex(headerRow, headerName) {
  const normalizedName = headerName.toLowerCase().trim();
  for (let i = 0; i < headerRow.length; i++) {
    const cell = (headerRow[i] || "").toString().trim().toLowerCase();
    if (cell === normalizedName) {
      return i;
    }
  }
  return -1;
}

/**
 * Convert a 0-indexed column number to A1 notation letter(s)
 * @param {number} colIndex - 0-indexed column number
 * @returns {string} Column letter(s) (A, B, ..., Z, AA, AB, ...)
 */
function columnToLetter(colIndex) {
  let letter = "";
  let temp = colIndex;

  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }

  return letter;
}

module.exports = {
  initializeClient,
  fetchChannelsConfig,
  fetchChannelAssignmentsConfig,
  fetchAllConfig,
  updateWeatherTable,
  findColumnIndex,
  columnToLetter,
};
