const { google } = require("googleapis");
const { logger } = require("../utils/logger");

/**
 * Google Sheets Service
 * Fetches webhook configuration from Commander Database and Diplomat Database sheets
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

/**
 * Build a region ID from continent and region name
 * @param {string} continent - Current Continent value
 * @param {string} region - Region value
 * @returns {string} Combined region ID (e.g., "Patlania Southern Point")
 */
function buildRegionId(continent, region) {
  const c = (continent || "").trim();
  const r = (region || "").trim();
  if (!c || !r) return null;
  return `${c} ${r}`;
}

/**
 * Fetch webhook configuration from Commander Database and Diplomat Database sheets
 * Returns webhooks grouped by region, plus the weekly forecast webhook URL
 *
 * @param {string} spreadsheetId - The Google Spreadsheet ID
 * @param {string} base64Key - Base64-encoded service account key
 * @returns {object} { webhooksByRegion: { regionId: [urls] }, weeklyForecastUrl: string|null }
 */
async function fetchWebhookConfig(spreadsheetId, base64Key) {
  const sheets = await initializeClient(base64Key);

  // Result structure: regionId -> array of webhook URLs
  const webhooksByRegion = {};
  let weeklyForecastUrl = null;

  // Also track commander regions for recipient override lookups
  // Map: commander name (lowercase) -> regionId
  const commanderRegionMap = {};

  // ==========================================
  // 1. Fetch Commander Database
  // ==========================================
  logger.info("Fetching Commander Database from Google Sheets");
  const commanderResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Commander Database",
  });

  const commanderRows = commanderResponse.data.values || [];
  if (commanderRows.length < 2) {
    throw new Error("Commander Database sheet is empty or has no data rows");
  }

  const cmdHeader = commanderRows[0];
  const cmdData = commanderRows.slice(1);

  // Find required columns
  const cmdCols = {
    name: findColumnIndex(cmdHeader, "Name"),
    weatherWebhook: findColumnIndex(cmdHeader, "Weather Webhook"),
    continent: findColumnIndex(cmdHeader, "Current Continent"),
    region: findColumnIndex(cmdHeader, "Region"),
  };

  // Validate required columns exist
  const missingCmdCols = Object.entries(cmdCols)
    .filter(([_, idx]) => idx === -1)
    .map(([name]) => name);
  if (missingCmdCols.length > 0) {
    throw new Error(
      `Commander Database missing required columns: ${missingCmdCols.join(
        ", "
      )}`
    );
  }

  logger.info(`Processing ${cmdData.length} rows from Commander Database`);

  for (const row of cmdData) {
    const name = (row[cmdCols.name] || "").trim();
    const webhookUrl = (row[cmdCols.weatherWebhook] || "").trim();
    const continent = (row[cmdCols.continent] || "").trim();
    const region = (row[cmdCols.region] || "").trim();

    // Build region ID
    const regionId = buildRegionId(continent, region);

    // Track commander -> region mapping for recipient override
    if (name && regionId) {
      commanderRegionMap[name.toLowerCase()] = regionId;
    }

    // Skip if no webhook URL (log silently)
    if (!webhookUrl) {
      logger.info(
        `Skipping commander "${name}": no Weather Webhook configured`
      );
      continue;
    }

    // Skip if no region
    if (!regionId) {
      logger.warn(
        `Skipping commander "${name}": missing Current Continent or Region`
      );
      continue;
    }

    // Add to webhooks by region
    if (!webhooksByRegion[regionId]) {
      webhooksByRegion[regionId] = [];
    }
    webhooksByRegion[regionId].push(webhookUrl);
    logger.info(`Added commander "${name}" webhook to region "${regionId}"`);
  }

  // ==========================================
  // 2. Fetch Diplomat Database
  // ==========================================
  logger.info("Fetching Diplomat Database from Google Sheets");
  const diplomatResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Diplomat Database",
  });

  const diplomatRows = diplomatResponse.data.values || [];
  if (diplomatRows.length < 2) {
    throw new Error("Diplomat Database sheet is empty or has no data rows");
  }

  const dipHeader = diplomatRows[0];
  const dipData = diplomatRows.slice(1);

  // Find required columns
  const dipCols = {
    name: findColumnIndex(dipHeader, "Name"),
    weatherWebhook: findColumnIndex(dipHeader, "Weather Webhook"),
    continent: findColumnIndex(dipHeader, "Current Continent"),
    region: findColumnIndex(dipHeader, "Region"),
    isLeader: findColumnIndex(dipHeader, "Is Leader"),
    recipientOverride: findColumnIndex(dipHeader, "Recipient Override"),
  };

  // Validate required columns (recipientOverride and isLeader are optional)
  const requiredDipCols = ["name", "weatherWebhook", "continent", "region"];
  const missingDipCols = requiredDipCols.filter((col) => dipCols[col] === -1);
  if (missingDipCols.length > 0) {
    throw new Error(
      `Diplomat Database missing required columns: ${missingDipCols.join(", ")}`
    );
  }

  logger.info(`Processing ${dipData.length} rows from Diplomat Database`);

  for (const row of dipData) {
    const name = (row[dipCols.name] || "").trim();
    const webhookUrl = (row[dipCols.weatherWebhook] || "").trim();
    const continent = (row[dipCols.continent] || "").trim();
    const region = (row[dipCols.region] || "").trim();
    const isLeader =
      dipCols.isLeader !== -1
        ? (row[dipCols.isLeader] || "").toString().toUpperCase() === "TRUE"
        : false;
    const recipientOverride =
      dipCols.recipientOverride !== -1
        ? (row[dipCols.recipientOverride] || "").trim()
        : "";

    // Check for weekly forecast channel (Is Leader = TRUE, used for consolidated forecast)
    if (isLeader && webhookUrl) {
      weeklyForecastUrl = webhookUrl;
      logger.info(`Found weekly forecast webhook from "${name}"`);
      // Don't add weekly forecast to regular weather - it gets consolidated
      continue;
    }

    // Skip if no webhook URL (log silently)
    if (!webhookUrl) {
      logger.info(`Skipping diplomat "${name}": no Weather Webhook configured`);
      continue;
    }

    // Determine region - check for recipient override
    let regionId = null;
    if (recipientOverride) {
      // Look up the overriding commander's region
      const overrideKey = recipientOverride.toLowerCase();
      if (commanderRegionMap[overrideKey]) {
        regionId = commanderRegionMap[overrideKey];
        logger.info(
          `Diplomat "${name}" using recipient override to "${recipientOverride}" -> region "${regionId}"`
        );
      } else {
        // Override specified but commander not found - use diplomat's own region
        logger.warn(
          `Diplomat "${name}" has recipient override "${recipientOverride}" but commander not found, using own region`
        );
        regionId = buildRegionId(continent, region);
      }
    } else {
      // Use diplomat's own region
      regionId = buildRegionId(continent, region);
    }

    // Skip if no region
    if (!regionId) {
      logger.warn(
        `Skipping diplomat "${name}": missing Current Continent or Region`
      );
      continue;
    }

    // Add to webhooks by region
    if (!webhooksByRegion[regionId]) {
      webhooksByRegion[regionId] = [];
    }
    webhooksByRegion[regionId].push(webhookUrl);
    logger.info(`Added diplomat "${name}" webhook to region "${regionId}"`);
  }

  // Log summary
  const regionCount = Object.keys(webhooksByRegion).length;
  const totalWebhooks = Object.values(webhooksByRegion).reduce(
    (sum, arr) => sum + arr.length,
    0
  );
  logger.info(`Loaded ${totalWebhooks} webhooks across ${regionCount} regions`);
  if (weeklyForecastUrl) {
    logger.info("Weekly forecast webhook configured");
  } else {
    logger.warn(
      "No weekly forecast webhook found (no row with Is Leader = TRUE)"
    );
  }

  return {
    webhooksByRegion,
    weeklyForecastUrl,
  };
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
async function updateWeatherTable(
  spreadsheetId,
  base64Key,
  weatherByRegionName
) {
  try {
    const sheets = await initializeClient(base64Key);

    // Read a targeted range where the weather table is expected (rows 15-50)
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
    const startRow = 15;

    for (let rowIdx = 0; rowIdx < headerRows.length; rowIdx++) {
      const row = headerRows[rowIdx];
      nameColIndex = findColumnIndex(row, "name");

      if (nameColIndex !== -1) {
        weatherColIndex = findColumnIndex(row, "current weather");

        if (weatherColIndex !== -1) {
          headerRowIndex = rowIdx + startRow - 1;
          logger.info(
            `Found weather table headers at row ${headerRowIndex + 1}, ` +
              `name col ${nameColIndex + 1}, weather col ${weatherColIndex + 1}`
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

    // Read data rows starting from the header row
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `Master Lists!A${headerRowIndex + 2}:Z`,
    });

    const dataRows = dataResponse.data.values || [];
    const lookupKeys = Object.keys(weatherByRegionName);
    logger.info(`Looking for regions: ${JSON.stringify(lookupKeys)}`);

    // Build batch update data
    const updates = [];
    let updatedCount = 0;

    for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
      const row = dataRows[rowIdx];
      const actualSheetRow = headerRowIndex + 2 + rowIdx;
      const regionName = (row[nameColIndex] || "")
        .toString()
        .trim()
        .replace(/^["']+|["']+$/g, "");

      if (!regionName) {
        break;
      }

      logger.info(
        `Found region in sheet row ${actualSheetRow}: "${regionName}"`
      );

      // Try to find matching weather
      let weather = weatherByRegionName[regionName];

      if (!weather) {
        const normalizedSheetName = regionName.toLowerCase().trim();

        for (const configKey of lookupKeys) {
          const normalizedConfigKey = configKey.toLowerCase().trim();

          if (normalizedConfigKey.endsWith(normalizedSheetName)) {
            weather = weatherByRegionName[configKey];
            logger.info(
              `Matched sheet "${regionName}" to config "${configKey}"`
            );
            break;
          }

          const configWords = normalizedConfigKey.split(/\s+/);
          const lastConfigWord = configWords[configWords.length - 1];
          if (
            lastConfigWord.length > 3 &&
            normalizedSheetName.startsWith(lastConfigWord)
          ) {
            weather = weatherByRegionName[configKey];
            logger.info(
              `Matched sheet "${regionName}" to config "${configKey}"`
            );
            break;
          }

          const sheetWithoutGeneric = normalizedSheetName
            .replace(/\s*(region|island|point|peninsula)s?\s*/gi, " ")
            .trim();
          if (
            sheetWithoutGeneric.length > 3 &&
            normalizedConfigKey.includes(sheetWithoutGeneric)
          ) {
            weather = weatherByRegionName[configKey];
            logger.info(
              `Matched sheet "${regionName}" to config "${configKey}"`
            );
            break;
          }
        }
      }

      if (weather) {
        const colLetter = columnToLetter(weatherColIndex);
        const cellRange = `Master Lists!${colLetter}${actualSheetRow}`;

        updates.push({
          range: cellRange,
          values: [[weather]],
        });
        updatedCount++;
        logger.info(
          `Queued weather update for region "${regionName}": ${weather}`
        );
      }
    }

    if (updates.length === 0) {
      logger.warn("No weather updates to apply");
      return { updated: 0 };
    }

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

module.exports = {
  initializeClient,
  fetchWebhookConfig,
  updateWeatherTable,
  findColumnIndex,
  columnToLetter,
};
