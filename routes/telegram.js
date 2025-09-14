const express = require('express')
const { adminAuth } = require('../middleware/auth')
const telegramService = require('../services/telegramService')
const router = express.Router()

// Test Telegram bot connection (admin only)
router.get('/test', adminAuth, async (req, res) => {
	try {
		const botInfo = await telegramService.testBot()
		res.json({
			success: true,
			message: 'Telegram bot connection successful',
			botInfo,
		})
	} catch (error) {
		console.error('Telegram test error:', error)
		res.status(500).json({
			success: false,
			message: 'Failed to connect to Telegram bot',
			error: error.message,
		})
	}
})

// Send custom notification (admin only)
router.post('/notify', adminAuth, async (req, res) => {
	try {
		const { message, type = 'info' } = req.body

		if (!message) {
			return res.status(400).json({
				success: false,
				message: 'Message is required',
			})
		}

		const results = await telegramService.sendSystemNotification(message, type)

		res.json({
			success: true,
			message: 'Notification sent',
			results,
		})
	} catch (error) {
		console.error('Send notification error:', error)
		res.status(500).json({
			success: false,
			message: 'Failed to send notification',
			error: error.message,
		})
	}
})

// Get Telegram service status (admin only)
router.get('/status', adminAuth, async (req, res) => {
	try {
		const isConfigured = !!process.env.TELEGRAM_BOT_TOKEN
		const adminChatIds = telegramService.adminChatIds

		res.json({
			success: true,
			status: {
				configured: isConfigured,
				adminChatIds: adminChatIds.length,
				token: isConfigured ? 'Configured' : 'Missing',
			},
		})
	} catch (error) {
		console.error('Get status error:', error)
		res.status(500).json({
			success: false,
			message: 'Failed to get status',
			error: error.message,
		})
	}
})

module.exports = router
