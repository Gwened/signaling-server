# signaling-server

A WebSocket signaling server for peer-to-peer connections.

## Telegram Notifications

The server can send Telegram notifications when someone is online alone.

### Setup Instructions

1. **Create a Telegram Bot:**
   - Message [@BotFather](https://t.me/BotFather) on Telegram
   - Send `/newbot`
   - Choose a name (e.g., "Signaling Server Bot")
   - Choose a username (e.g., "my_signaling_bot")
   - Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

2. **Get Your Chat ID:**
   - Start a chat with your bot
   - Send any message to the bot
   - Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
   - Find your `chat_id` in the response (usually a number like `123456789`)

3. **Configure Environment Variables:**
   ```bash
   TELEGRAM_BOT_TOKEN=your-bot-token
   TELEGRAM_CHAT_ID=your-chat-id
   ```

## Environment Variables

- `BOTS_ENABLED`: Enable bot peers (default: true in dev)
- `BOT_LIFETIME_MS`: Bot lifetime in milliseconds (default: 18000)
- `DEV`: Development mode (default: false)