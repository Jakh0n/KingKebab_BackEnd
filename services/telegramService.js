const axios = require('axios')

class TelegramService {
	constructor() {
		this.botToken = process.env.TELEGRAM_BOT_TOKEN
		this.baseURL = `https://api.telegram.org/bot${this.botToken}`

		// Admin/Manager chat IDs - should be moved to database later
		this.adminChatIds = [
			'6808924520', // First admin
			'158467590', // Second admin
		]
	}

	/**
	 * Send a message to specific chat IDs
	 * @param {string|Array} chatIds - Single chat ID or array of chat IDs
	 * @param {string} message - Message text
	 * @param {Object} options - Additional options (parse_mode, etc.)
	 */
	async sendMessage(chatIds, message, options = {}) {
		if (!this.botToken) {
			console.error('Telegram bot token not configured')
			return false
		}

		// Ensure chatIds is an array
		const ids = Array.isArray(chatIds) ? chatIds : [chatIds]

		const promises = ids.map(async chatId => {
			try {
				const response = await axios.post(`${this.baseURL}/sendMessage`, {
					chat_id: chatId,
					text: message,
					parse_mode: options.parse_mode || 'Markdown',
					...options,
				})

				console.log(`✅ Telegram message sent to ${chatId}`)
				return { chatId, success: true, data: response.data }
			} catch (error) {
				console.error(
					`❌ Failed to send Telegram message to ${chatId}:`,
					error.response?.data || error.message
				)
				return { chatId, success: false, error: error.message }
			}
		})

		const results = await Promise.allSettled(promises)
		return results.map(result => result.value || result.reason)
	}

	/**
	 * Send notification to all admin chats
	 * @param {string} message - Message text
	 * @param {Object} options - Additional options
	 */
	async sendToAdmins(message, options = {}) {
		return await this.sendMessage(this.adminChatIds, message, options)
	}

	/**
	 * Format and send time entry notification
	 * @param {Object} data - Time entry data
	 * @param {string} action - Action type (added, updated, deleted)
	 */
	async sendTimeEntryNotification(data, action = 'added') {
		const {
			user,
			date,
			startTime,
			endTime,
			hours,
			overtimeReason,
			responsiblePerson,
		} = data

		let emoji = '🕒'
		let actionText = 'Time entry added'

		switch (action) {
			case 'updated':
				emoji = '✏️'
				actionText = 'Time entry updated'
				break
			case 'deleted':
				emoji = '🗑️'
				actionText = 'Time entry deleted'
				break
			default:
				emoji = '🔔'
				actionText = 'New time entry added'
		}

		// Format times safely
		const startTimeFormatted = new Date(startTime).toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
		})
		const endTimeFormatted = new Date(endTime).toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
		})
		const dateFormatted = new Date(date).toLocaleDateString('en-GB')

		// Build message parts safely with HTML formatting
		let message = `${emoji} <b>${actionText}</b>\n\n`
		message += `👤 <b>Employee:</b> ${
			user?.username || user?.name || 'Unknown'
		}\n`
		message += `📅 <b>Date:</b> ${dateFormatted}\n`
		message += `⏰ <b>Start:</b> ${startTimeFormatted}\n`
		message += `🏁 <b>End:</b> ${endTimeFormatted}\n`
		message += `⏱️ <b>Hours:</b> ${hours}h`

		if (overtimeReason) {
			message += `\n⚠️ <b>Overtime:</b> ${overtimeReason}`
		}

		if (responsiblePerson) {
			message += `\n👨‍💼 <b>Responsible:</b> ${responsiblePerson}`
		}

		return await this.sendToAdmins(message, { parse_mode: 'HTML' })
	}

	/**
	 * Send announcement notification
	 * @param {Object} announcement - Announcement data
	 * @param {string} action - Action type (created, updated, deleted)
	 */
	async sendAnnouncementNotification(announcement, action = 'created') {
		const { title, content, type } = announcement

		let emoji = '📢'
		let actionText = 'New announcement'

		switch (action) {
			case 'updated':
				emoji = '✏️'
				actionText = 'Announcement updated'
				break
			case 'deleted':
				emoji = '🗑️'
				actionText = 'Announcement deleted'
				break
		}

		// Type-specific emojis
		const typeEmoji = {
			info: 'ℹ️',
			warning: '⚠️',
			success: '✅',
		}

		const message = `${emoji} <b>${actionText}</b>

${typeEmoji[type] || 'ℹ️'} <b>${title}</b>

${content}`

		return await this.sendToAdmins(message, { parse_mode: 'HTML' })
	}

	/**
	 * Send user registration notification
	 * @param {Object} user - User data
	 */
	async sendUserRegistrationNotification(user) {
		const { username, employeeId, position, name } = user

		const message = `👤 <b>New user registered!</b>

👤 <b>Username:</b> ${username}
🆔 <b>Employee ID:</b> ${employeeId}
💼 <b>Position:</b> ${position.charAt(0).toUpperCase() + position.slice(1)}${
			name ? `\n📝 <b>Name:</b> ${name}` : ''
		}
📅 <b>Date:</b> ${new Date().toLocaleDateString('en-GB')}`

		return await this.sendToAdmins(message, { parse_mode: 'HTML' })
	}

	/**
	 * Send system notification
	 * @param {string} message - System message
	 * @param {string} type - Message type (info, warning, error)
	 */
	async sendSystemNotification(message, type = 'info') {
		const emoji = {
			info: 'ℹ️',
			warning: '⚠️',
			error: '🚨',
		}

		const formattedMessage = `${emoji[type]} <b>System Notification</b>

${message}

📅 <b>Time:</b> ${new Date().toLocaleString('en-GB')}`

		return await this.sendToAdmins(formattedMessage, { parse_mode: 'HTML' })
	}

	/**
	 * Test the bot connection
	 */
	async testBot() {
		try {
			const response = await axios.get(`${this.baseURL}/getMe`)
			console.log(
				'✅ Telegram bot connection successful:',
				response.data.result
			)
			return response.data.result
		} catch (error) {
			console.error('❌ Telegram bot connection failed:', error.message)
			throw error
		}
	}
}

module.exports = new TelegramService()
