# Multi-Tenant SaaS Telegram Bot: Database-per-Tenant Architecture

## Core Architecture

The bot has been upgraded to a **Database-per-Tenant** model for maximum isolation and scalability.

- **Master Registry**: A central `master.db` stores tenant metadata, bot tokens, and paths to their specific database files.
- **Full Isolation**: Each tenant has their own physically separate SQLite database file. Data corruption or large database sizes in one tenant will not affect others.
- **Dynamic DB Factory**: The system uses a Factory pattern with an **LRU Cache** to manage database connections dynamically, keeping memory usage low even with 200+ tenants.
- **Google Calendar**: Automated event sync with independent credentials stored in each tenant's database.

## Deployment & Onboarding

1. **Register a New Tenant**:
   Use the onboarding script to create the database and register the master:
   ```bash
   node onboard.js <TENANT_ID> <TENANT_NAME> <BOT_TOKEN> [TIMEZONE]
   ```

2. **Global Migrations**:
   To update the schema for all tenants at once:
   ```bash
   node migrate_all.js "ALTER TABLE services ADD COLUMN is_active INTEGER DEFAULT 1;"
   ```

3. **Running the SaaS**:
   `npm start`

## Scaling for 200+ Tenants

- **Connection Management**: The LRU cache (configured in `database/tenant_factory.js`) ensures that only active tenants hold an open file handle, preventing the "too many open files" error.
- **Storage**: Since each tenant is a separate file, you can easily move individual tenant databases to different storage volumes or even different servers if needed.
- **Backups**: You can perform atomic backups of individual tenants by simply copying their `.db` file, without having to dump a giant shared database.
