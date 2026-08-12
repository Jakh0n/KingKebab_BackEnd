const express = require('express')
const {
	handleMiniAppUpdate,
} = require('../services/miniAppBotService')

const router = express.Router()

function verifySecret(req) {
	const expected =
		process.env.TELEGRAM_MINI_APP_WEBHOOK_SECRET ||
		process.env.JWT_SECRET ||
		''
	if (!expected) return true
	const received = req.get('X-Telegram-Bot-Api-Secret-Token') || ''
	return received === expected
}

// Telegram sends updates here
router.post('/webhook', async (req, res) => {
	try {
		if (!verifySecret(req)) {
			return res.status(401).json({ ok: false })
		}

		// Always ack quickly so Telegram doesn't retry
		res.json({ ok: true })

		const update = req.body
		if (update) {
			await handleMiniAppUpdate(update)
		}
	} catch (error) {
		console.error('Mini App webhook error:', error.message)
		if (!res.headersSent) {
			res.json({ ok: true })
		}
	}
})

// Manual test: send welcome to a chat id (admin tooling)
router.get('/health', (_req, res) => {
	res.json({
		ok: true,
		configured: Boolean(process.env.TELEGRAM_MINI_APP_BOT_TOKEN),
		frontend: process.env.FRONTEND_URL || null,
	})
})

module.exports = router
