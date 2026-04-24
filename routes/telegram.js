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

		// Log security event
		const clientIp = req.ip || req.connection.remoteAddress
		console.log(`🔐 SECURITY EVENT: Bot status checked`)
		console.log(`   Admin: ${req.user.username}`)
		console.log(`   IP Address: ${clientIp}`)
		console.log(`   Timestamp: ${new Date().toISOString()}`)

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

// Bot protection endpoint - check if bot settings were changed (admin only)
router.get('/protect', adminAuth, async (req, res) => {
	try {
		const axios = require('axios')
		const botToken = process.env.TELEGRAM_BOT_TOKEN

		if (!botToken) {
			return res.status(400).json({
				success: false,
				message: 'Bot token not configured',
			})
		}

		// Get current bot info from Telegram
		const response = await axios.get(
			`https://api.telegram.org/bot${botToken}/getMe`
		)

		if (response.data.ok) {
			const botInfo = response.data.result

			// Log security check
			const clientIp = req.ip || req.connection.remoteAddress
			console.log(`🔐 SECURITY EVENT: Bot protection check`)
			console.log(`   Admin: ${req.user.username}`)
			console.log(`   IP Address: ${clientIp}`)
			console.log(`   Bot: ${botInfo.username} (ID: ${botInfo.id})`)
			console.log(`   Timestamp: ${new Date().toISOString()}`)

			res.json({
				success: true,
				botInfo: {
					id: botInfo.id,
					username: botInfo.username,
					firstName: botInfo.first_name,
					canJoinGroups: botInfo.can_join_groups,
					canReadAllGroupMessages: botInfo.can_read_all_group_messages,
					supportsInlineQueries: botInfo.supports_inline_queries,
				},
				message: 'Bot information retrieved successfully',
			})
		} else {
			res.status(500).json({
				success: false,
				message: 'Failed to get bot information',
			})
		}
	} catch (error) {
		console.error('Bot protection check error:', error)
		res.status(500).json({
			success: false,
			message: 'Failed to check bot protection',
			error: error.message,
		})
	}
})

module.exports = router
