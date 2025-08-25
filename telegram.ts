

// Notification configuration
const NOTIFICATION_CONFIG = {
    telegramBotToken: Bun.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: Bun.env.TELEGRAM_CHAT_ID || "",
  };
  
  export default async function sendTelegramNotification(message: string) {
    try {
      if (!NOTIFICATION_CONFIG.telegramBotToken || !NOTIFICATION_CONFIG.telegramChatId) {
        console.error("Telegram configuration incomplete, skipping notification");
        return;
      }
  
      const url = `https://api.telegram.org/bot${NOTIFICATION_CONFIG.telegramBotToken}/sendMessage`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: NOTIFICATION_CONFIG.telegramChatId,
          text: message,
          parse_mode: "HTML"
        }),
      });
  
      const result = await response.json() as {ok: boolean, description: string};
      if (result.ok) {
        console.log("Telegram notification sent successfully");
      } else {
        console.error("Failed to send Telegram notification:", result.description);
      }
    } catch (error) {
      console.error("Error sending Telegram notification:", error);
    }
}
  