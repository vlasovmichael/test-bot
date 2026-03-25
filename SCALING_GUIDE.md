# Multi-Tenant SaaS Telegram Bot Scaling & Deployment Guide

## Core Architecture

The bot has been refactored into a universal, multi-tenant SaaS template.

- **Generic Service Model**: Each tenant (master) can define their own categories, services, durations, and prices via the admin panel.
- **Data Isolation**: Application-level Row-Level Security (RLS) using `tenant_id` on all tables.
- **Timezone Support**: Each tenant can have a unique timezone managed by `luxon`.
- **Google Calendar**: Automated event sync with independent OAuth2 credentials per tenant.
- **Google OAuth Server**: Integrated Express server handles OAuth2 redirects at `/auth/google/callback`.

## Deployment Instructions

1. **Environment Variables**:
   Create a `.env` file for each tenant instance or use a central configuration manager.
   ```env
   BOT_TOKEN=your_telegram_bot_token
   ADMIN_ID=your_telegram_id
   TENANT_ID=unique_tenant_identifier
   TIMEZONE=Europe/Warsaw
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=...
   PORT=3000
   ```

2. **Database Initialization**:
   The database schema is automatically initialized on the first run. Ensure you have the necessary write permissions.

3. **Running the Bot**:
   `npm start`

## Scaling for 200+ Tenants

To scale to 100-200+ independent clients:

### 1. Database Scaling
- **RLS vs. Schema Isolation**: While currently using a shared SQLite database with `tenant_id` (RLS), as you scale towards 200+ tenants, migrating to a central PostgreSQL instance with RLS is highly recommended. SQLite is excellent for smaller scales, but 200 concurrent write processes can lead to locking issues.
- **Connection Pooling**: Use a connection pooler like PgBouncer when moving to PostgreSQL to handle hundreds of concurrent bot instances efficiently.

### 2. High Concurrency & Race Conditions
- **Transactions**: Core booking logic is wrapped in `db.transaction()` (SQLite) or similar PostgreSQL transactions. This ensures that two users cannot book the same slot simultaneously.
- **Rate Limiting**: Integrated `p-ratelimit` middleware protects the bot API from being overwhelmed by multiple tenants or spam bots.

### 3. Google Calendar API
- **OAuth2 Flow**: Each master uses their own Google account. The bot provides a unique Auth URL via the admin panel. Once authenticated, tokens are stored and refreshed automatically per tenant.
- **Quotas**: Monitor your Google Cloud Project quotas as you add more tenants.

### 4. Infrastructure
- **Containerization**: Deploy bot instances using Docker for better isolation.
- **Monitoring**: Use a tool like Prometheus/Grafana or a centralized logging system (e.g., ELK stack) to monitor all 200+ bot instances from a single dashboard.
