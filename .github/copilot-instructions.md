# GitHub Copilot Instructions for Discord Weather Webhook

## Project Overview

Webhook service that posts daily weather updates for fictional campaigns to Discord. Runs on GitHub Actions with deterministic weather generation.

## Code Style

- Use CommonJS (`require`/`module.exports`)
- Prefer async/await
- Add error handling to all async operations
- Use the custom logger for all output

## Project Structure

- **Main Entry**: [`webhook.js`](../webhook.js) - daily weather webhook execution
- **Weekly Entry**: [`weekly-webhook.js`](../weekly-webhook.js) - weekly forecast webhook execution
- **Config**: [`src/config/config.js`](../src/config/config.js) - configuration loading
- **Weather Service**: [`src/services/weatherService.js`](../src/services/weatherService.js) - weather generation logic
- **Google Sheets Service**: [`src/services/googleSheetsService.js`](../src/services/googleSheetsService.js) - webhook URL fetching
- **Logger**: [`src/utils/logger.js`](../src/utils/logger.js) - structured logging

## Data Sources

**Google Sheets (Required):**

- `Commander Database` sheet - Weather webhooks for commander channels
- `Diplomat Database` sheet - Weather webhooks for diplomat channels, weekly forecast webhook (Is Leader = TRUE)

**Local Config:**

- `regions.json` - Weather probabilities per region (seasonal conditions with weights)

## Environment Variables

**Required:**

- `GOOGLE_SERVICE_ACCOUNT_KEY`: Base64-encoded service account JSON
- `GOOGLE_SPREADSHEET_ID`: Google Spreadsheet ID containing Commander/Diplomat databases

**Local Development:**

- Create `.env` file with the above variables
- `regions.json` defines weather probabilities (checked in order: project root, config/, src/config/)

## Weather System

**Standard Weather Types:**

- Clear Skies, Light Rain, Heavy Rain, Storm
- Hot, Heatwave
- Snow, Blizzard
- Fog

Each type has mechanical impacts defined in `weatherService.js`:

- Travel speed multipliers (road/off-road)
- March restrictions (forced/night)
- Visibility and river fording

## Region Mapping

Region IDs are built from Google Sheets columns: `Current Continent` + ` ` + `Region`

Example: Continent "Patlania" + Region "Southern Point" → "Patlania Southern Point"

This must match the key in `regions.json` for weather probabilities.

## Recipient Override

Diplomats can have a "Recipient Override" that points to a commander name. When set, the diplomat receives weather for the overriding commander's region instead of their own.

## Testing Locally

```bash
npm test          # runs test-webhook.js (daily weather)
npm run test-weekly  # runs test-weekly.js (weekly forecast)
```

## Key Features

- **Deterministic**: Same date + region = same weather
- **Seasonal**: Weather varies by time of year with weighted probabilities
- **Dual Webhooks**: Daily updates for players, consolidated weekly forecasts for GMs
- **Dynamic Emojis**: Weather-appropriate emojis that differ for day/night
- **Mechanical Impacts**: Travel speed, march restrictions, visibility effects
- **Google Sheets Integration**: Webhook URLs fetched dynamically from spreadsheet
