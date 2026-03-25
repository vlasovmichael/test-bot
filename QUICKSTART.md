# Quick Start for New Masters

Welcome to the Multi-Tenant Appointment Bot SaaS!

To onboard a new master (tenant) and set up their specific bot, follow these steps:

## 1. Environment Setup
Create a new `.env` file for the master with their unique credentials:

```env
BOT_TOKEN=new_master_telegram_bot_token
ADMIN_ID=master_telegram_user_id
TENANT_ID=unique_master_name
TIMEZONE=Europe/Warsaw
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

## 2. Tenant Initialization
Run the onboarding script to initialize the master's database entries and generate default time slots:

```bash
node onboard.js <TENANT_ID> <TENANT_NAME> [TIMEZONE]
# Example:
node onboard.js master1 "John the Barber" "Europe/Warsaw"
```

## 3. Google Calendar Sync
1. Start the bot (`npm start`).
2. The master must send the `/admin` command to the bot.
3. Click on **🔗 Google Calendar**.
4. Follow the provided link to authorize the bot with their Google account.
5. The bot will automatically start syncing bookings to their "primary" calendar.

## 4. Service Configuration
Masters can manage their categories and services directly via the bot:
- `/admin` -> **⚙️ Settings** -> **✨ Manage Services**
- Add categories (e.g., "Haircuts", "Beard Trim").
- Add services with duration and price (e.g., "Mens Haircut", 45 mins, 50.00).

## 5. Schedule Customization
Adjust work days and hours via the admin panel:
- `/admin` -> **⚙️ Settings** -> **📅 Work Days** / **🕒 Hours**
