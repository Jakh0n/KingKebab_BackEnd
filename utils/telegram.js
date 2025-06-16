const axios = require('axios')

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

async function sendTelegramNotification(message) {
	try {
		if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
			console.warn('Telegram bot token or chat ID not configured')
			return
		}

		const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
		await axios.post(url, {
			chat_id: TELEGRAM_CHAT_ID,
			text: message,
			parse_mode: 'HTML',
		})
	} catch (error) {
		console.error('Error sending Telegram notification:', error.message)
	}
}

module.exports = {
	sendTelegramNotification,
}
