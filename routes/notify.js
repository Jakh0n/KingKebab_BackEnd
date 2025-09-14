const express = require('express')
const axios = require('axios')
const { auth } = require('../middleware/auth')
const router = express.Router()

// Simple Telegram notification endpoint
router.post('/telegram', auth, async (req, res) => {
	try {
		const { message, user } = req.body

		if (!message) {
			return res
				.status(400)
				.json({ success: false, message: 'Message required' })
		}

		const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
		const ADMIN_CHAT_IDS = ['6808924520', '158467590']

		if (!BOT_TOKEN) {
			console.log('❌ Telegram bot token not configured in backend')
			return res.json({ success: false, message: 'Bot token not configured' })
		}

		console.log('📤 Sending Telegram notifications...')

		// Send to all admin chats
		const promises = ADMIN_CHAT_IDS.map(async chatId => {
			try {
				const response = await axios.post(
					`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
					{
						chat_id: chatId,
						text: message,
					}
				)
				console.log(`✅ Message sent to ${chatId}`)
				return { chatId, success: true }
			} catch (error) {
				console.error(`❌ Failed to send to ${chatId}:`, error.message)
				return { chatId, success: false, error: error.message }
			}
		})

		const results = await Promise.allSettled(promises)
		const successful = results.filter(
			r => r.status === 'fulfilled' && r.value?.success
		).length

		console.log(
			`📱 Telegram notifications: ${successful}/${ADMIN_CHAT_IDS.length} successful`
		)

		res.json({
			success: true,
			message: `Sent to ${successful}/${ADMIN_CHAT_IDS.length} chats`,
			results: results.map(r => r.value || r.reason),
		})
	} catch (error) {
		console.error('❌ Notification error:', error)
		res.status(500).json({
			success: false,
			message: 'Failed to send notifications',
			error: error.message,
		})
	}
})

module.exports = router
