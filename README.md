# MeFinance

A minimalist finance tracking app with AI-powered insights. Track your accounts, expenses, budgets, and subscriptions all in one place.

## Features

- 📊 **Account Management** - Track multiple banks, cards, cash, and investments
- 💰 **Expense Tracking** - Log income and expenses with categories
- 📈 **Budget Management** - Set budgets by category and track spending
- 📅 **Subscription Tracking** - Never miss a subscription renewal
- 🤖 **AI Financial Advisor** - Get insights and purchase advice powered by ChatGPT
- 🔔 **Push Notifications** - Budget alerts and subscription reminders
- 🎨 **Minimalist Design** - Clean black & white interface

## Quick Start

See [SETUP.md](./SETUP.md) for detailed installation instructions.

1. Install dependencies: `npm install`
2. Create `.env` file with your API keys:
   ```
   EXPO_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
   EXPO_PUBLIC_LOGO_DEV_KEY=your_logo_dev_public_key_here
   ```
3. Run: `npm start`

## Tech Stack

- **React Native** with Expo - Cross-platform mobile development
- **TypeScript** - Type-safe code
- **SQLite** - Local data storage
- **OpenAI API** - AI financial analysis
- **Expo Notifications** - Push notifications

## Project Structure

```
src/
  ├── database/     # SQLite database operations
  ├── screens/      # App screens
  ├── services/     # AI and notification services
  └── theme/        # Design system (colors, typography)
```

## License

MIT

