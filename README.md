# Discord Weather Webhook for Cataphracts Campaigns

Automated daily weather updates for real-time [Cataphracts](https://samsorensen.blot.im/cataphracts-design-diary-1) campaigns. Posts deterministic, date-based weather to Discord channels via GitHub Actions.

## Easy Setup Guide

This guide assumes you have never used GitHub or coded before. Follow each step carefully.

### Step 1: Set Up Your Discord Channel

1. Open Discord and go to the channel where you want weather updates
2. Click the gear icon (⚙️) next to the channel name
3. Select "Integrations" from the left menu
4. Click "Webhooks"
5. Click "New Webhook"
6. Give it a name like "Weather Bot"
7. Click "Copy Webhook URL" and save this URL somewhere safe - you'll need it later
8. Click "Save Changes"

**Optional: Use a Discord Thread**
If you want weather updates in a thread to keep your main channel clean:

1. In your Discord channel, type a message like "Weather Updates"
2. Right-click on your message and select "Create Thread"
3. Name the thread something like "Daily Weather"
4. Copy the thread's webhook URL instead by going to the thread settings → Integrations → Webhooks
5. Create the webhook in the thread and use that URL in your configuration

This keeps all weather updates organized in one thread instead of cluttering the main channel.

### Step 2: Get This Code

1. Go to https://github.com/your-username/discord-weather-bot (replace with actual repo)
2. Click the green "Code" button
3. Click "Download ZIP"
4. Extract the ZIP file to your computer
5. Remember where you saved it

### Step 3: Create Your Configuration Files

The bot uses three separate configuration files to keep things organized:

1. **channels.json** - Contains your sensitive Discord webhook URLs
2. **channel-assignments.json** - Maps which channels get which region's weather
3. **regions.json** - Contains your weather data (conditions, impacts, etc.)

#### Step 3a: Create channels.json

1. In the `src/config` folder, copy `channels-example.json`
2. Rename the copy to `channels.json`
3. Open `channels.json` and replace the example URLs with your Discord webhook URLs from Step 1:

```json
{
  "channels": {
    "player-channel-1": {
      "webhookUrl": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_TOKEN"
    },
    "gm-channel": {
      "webhookUrl": "https://discord.com/api/webhooks/YOUR_GM_WEBHOOK_ID/YOUR_TOKEN"
    }
  }
}
```

Give each channel a friendly name (like `"player-channel-1"` or `"gm-channel"`) - you'll use these names in the next file.

#### Step 3b: Create channel-assignments.json

1. In the `src/config` folder, copy `channel-assignments-example.json`
2. Rename the copy to `channel-assignments.json`
3. Open `channel-assignments.json` and map your regions to channels:

```json
{
  "assignments": {
    "temperate_coastal": {
      "channels": ["player-channel-1"]
    }
  },
  "weeklyForecastChannel": "gm-channel"
}
```

- **channels**: Array of channel names that get daily weather for this region
- **weeklyForecastChannel**: Single channel that gets weekly forecasts for all regions

#### Step 3c: Create regions.json

1. In the `src/config` folder, copy `regions-example.json`
2. Rename the copy to `regions.json`
3. Open `regions.json` and customize your weather data:

```json
{
  "regions": {
    "temperate_coastal": {
      "name": "Coastal Region",
      "seasonalWeather": {
        "spring": {
          "conditions": [
            "Mild and sunny",
            "Light rain",
            "Overcast"
          ],
          "mechanicalImpacts": {
            "Light rain": "Scouting range reduced by 1 hex"
          }
        },
        "summer": { ... },
        "autumn": { ... },
        "winter": { ... }
      }
    }
  }
}
```

**Important**: Region IDs in `regions.json` must match the region IDs in `channel-assignments.json`.

### Step 4: Set Up GitHub Actions (Automated Posting)

1. Go to https://github.com and create a free account if you don't have one
2. Click the "+" icon in the top right corner and select "New repository"
3. Name it something like "my-weather-bot"
4. Make sure "Public" is selected
5. Click "Create repository"
6. Click "uploading an existing file"
7. Drag all the files from your extracted folder into the upload area
8. Scroll down and click "Commit changes"

### Step 5: Configure Your GitHub Secrets

You need to add three secrets to GitHub:

1. In your GitHub repository, click "Settings" at the top
2. Click "Secrets and variables" in the left menu
3. Click "Actions"

**Add the first secret:**

1. Click "New repository secret"
2. Name: `CHANNELS_CONFIG`
3. Value: Copy and paste the entire contents of your `channels.json` file
4. Click "Add secret"

**Add the second secret:**

1. Click "New repository secret"
2. Name: `CHANNEL_ASSIGNMENTS_CONFIG`
3. Value: Copy and paste the entire contents of your `channel-assignments.json` file
4. Click "Add secret"

**Add the third secret:**

1. Click "New repository secret"
2. Name: `REGIONS_CONFIG`
3. Value: Copy and paste the entire contents of your `regions.json` file
4. Click "Add secret"

### Step 6: Test Your Setup

1. In your repository, click "Actions" at the top
2. Click "Daily Weather Update" on the left
3. Click "Run workflow" on the right
4. Click the green "Run workflow" button
5. Wait about 30 seconds, then refresh the page
6. Check your Discord channel - you should see a weather update

### Step 7: Schedule Your Weather Updates

Your weather will now automatically post:

- Daily at 12:00 PM UTC
- Weekly forecast on Saturdays at midnight UTC

To change these times:

1. Go to the `.github/workflows` folder in your repository
2. Edit `daily-weather.yml` and `weekly-forecast.yml` files
3. Change the `cron` line (search online for "cron schedule generator" for help)

## Managing Channels and Regions

### Why Three Files?

The three-file system separates concerns:

- **channels.json**: Sensitive webhook URLs (never commit to Git)
- **channel-assignments.json**: Easy-to-edit channel mappings
- **regions.json**: Large weather data file (rarely edited)

**Benefits:**

- ✅ Change which channels get weather without editing the large regions file
- ✅ Add/remove channels quickly
- ✅ Keep sensitive webhook URLs isolated
- ✅ One webhook URL can be used by multiple regions
- ✅ Multiple channels can receive the same region's weather

### Adding a New Region

**Step 1: Add to regions.json**

```json
{
  "regions": {
    "existing_region": { ... },
    "new_region": {
      "name": "New Region Name",
      "seasonalWeather": {
        "spring": { "conditions": [...] },
        "summer": { "conditions": [...] },
        "autumn": { "conditions": [...] },
        "winter": { "conditions": [...] }
      }
    }
  }
}
```

**Step 2: Assign channels in channel-assignments.json**

```json
{
  "assignments": {
    "existing_region": { ... },
    "new_region": {
      "channels": ["player-channel-1"]
    }
  }
}
```

**Step 3: Update GitHub secrets** with the new file contents.

### Adding a New Discord Channel

**Step 1: Create webhook in Discord** (see Step 1 above)

**Step 2: Add to channels.json**

```json
{
  "channels": {
    "existing-channel": { ... },
    "new-player-channel": {
      "webhookUrl": "https://discord.com/api/webhooks/NEW_WEBHOOK_URL"
    }
  }
}
```

**Step 3: Assign to a region in channel-assignments.json**

```json
{
  "assignments": {
    "temperate_coastal": {
      "channels": ["existing-channel", "new-player-channel"]
    }
  }
}
```

Now both channels will receive weather for the `temperate_coastal` region.

### Moving a Channel to a Different Region

Just edit `channel-assignments.json`:

**Before:**

```json
{
  "assignments": {
    "old_region": {
      "channels": ["player-channel-1"]
    }
  }
}
```

**After:**

```json
{
  "assignments": {
    "new_region": {
      "channels": ["player-channel-1"]
    }
  }
}
```

Update the `CHANNEL_ASSIGNMENTS_CONFIG` secret on GitHub, and the channel will immediately start receiving the new region's weather.

### Sharing Webhooks Between Regions

You can reuse webhook URLs for multiple regions:

**channels.json:**

```json
{
  "channels": {
    "shared-weather-hub": {
      "webhookUrl": "https://discord.com/api/webhooks/SHARED_URL"
    }
  }
}
```

**channel-assignments.json:**

```json
{
  "assignments": {
    "north_region": {
      "channels": ["shared-weather-hub"]
    },
    "south_region": {
      "channels": ["shared-weather-hub"]
    }
  }
}
```

Both regions will post to the same Discord channel.

## Local Testing

```bash
npm install
npm test          # Test daily weather
npm run test-weekly  # Test weekly forecast
```

The test commands will use your local `channels.json`, `channel-assignments.json`, and `regions.json` files.

## Configuration Reference

### channels.json

Maps friendly channel IDs to Discord webhook URLs.

```json
{
  "channels": {
    "channel-id": {
      "webhookUrl": "https://discord.com/api/webhooks/ID/TOKEN"
    }
  }
}
```

- **Location**: `src/config/channels.json` (gitignored - contains sensitive URLs)
- **Template**: `src/config/channels-example.json`

### channel-assignments.json

Maps region IDs to channel IDs.

```json
{
  "assignments": {
    "region_id": {
      "channels": ["channel-id-1", "channel-id-2"]
    }
  },
  "weeklyForecastChannel": "gm-channel"
}
```

- **channels**: Array of channel IDs that receive daily weather
- **weeklyForecastChannel**: Single channel ID for weekly consolidated forecasts
- **Location**: `src/config/channel-assignments.json` (gitignored but safe to version)
- **Template**: `src/config/channel-assignments-example.json`

### regions.json

Contains weather data for each region.

```json
{
  "regions": {
    "region_id": {
      "name": "Region Display Name",
      "seasonalWeather": {
        "spring": {
          "conditions": ["Condition 1", "Condition 2"],
          "mechanicalImpacts": {
            "Condition 1": "Game effect description"
          }
        },
        "summer": { ... },
        "autumn": { ... },
        "winter": { ... }
      }
    }
  }
}
```

- **name**: Display name for the region
- **seasonalWeather**: Weather patterns for each season
  - **conditions**: Array of weather descriptions (earlier items more likely)
  - **mechanicalImpacts**: Optional object mapping conditions to game effects
- **Location**: `src/config/regions.json` (gitignored - large file)
- **Template**: `src/config/regions-example.json`

## GitHub Actions Environment Variables

For GitHub Actions, set these secrets:

- **CHANNELS_CONFIG**: Complete `channels.json` as JSON string
- **CHANNEL_ASSIGNMENTS_CONFIG**: Complete `channel-assignments.json` as JSON string
- **REGIONS_CONFIG**: Complete `regions.json` as JSON string
- **WEEKLY_FORECAST_WEBHOOK_URL** (optional): Direct webhook URL for weekly forecasts (overrides channel-assignments)

## How It Works

- Weather is **deterministic**: same date produces same weather for each region
- Seasons change automatically based on calendar date (Northern Hemisphere)
- Each region has unique weather patterns defined in configuration
- Weather generation uses seeded randomization for consistency
- Discord messages include weather-appropriate emojis
- Configuration files are merged at runtime to resolve channels

## Files

- `webhook.js` - Daily weather sender
- `weekly-webhook.js` - Weekly forecast sender
- `test-webhook.js` - Local daily testing
- `test-weekly.js` - Local weekly testing
- `src/services/weatherService.js` - Weather generation logic
- `src/config/config.js` - Configuration loading and merging
- `src/config/channels.json` - Webhook URLs (create this, gitignored)
- `src/config/channel-assignments.json` - Region-to-channel mappings (create this, gitignored)
- `src/config/regions.json` - Weather data (create this, gitignored)

## Troubleshooting

**No weather posted**:

- Check webhook URLs in `channels.json`
- Verify channel IDs match between `channels.json` and `channel-assignments.json`
- Verify region IDs match between `regions.json` and `channel-assignments.json`
- Check Discord channel permissions

**Wrong timing**:

- Verify cron expressions in workflow files
- Remember GitHub Actions uses UTC time

**Configuration not found**:

- Ensure all three config files exist in `src/config/`
- Verify GitHub secrets are set correctly
- Check file names match exactly (case-sensitive)

**Channel not receiving weather**:

- Verify region has the channel in `channel-assignments.json`
- Check webhook URL is correct in `channels.json`
- Ensure region has seasonal weather data in `regions.json`

**Local testing fails**:

- Run `npm install`
- Ensure all three config files exist locally
- Check JSON syntax (use an online JSON validator)
