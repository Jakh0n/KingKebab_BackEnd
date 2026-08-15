const axios = require('axios')

function getMiniAppToken() {
	return process.env.TELEGRAM_MINI_APP_BOT_TOKEN || ''
}

function getMiniAppUrl() {
	const raw = process.env.FRONTEND_URL || 'https://shift.kingkebaborder.co.kr'
	return raw.replace(/\/$/, '')
}

function getApiBase() {
	return getMiniAppToken()
		? `https://api.telegram.org/bot${getMiniAppToken()}`
		: null
}

function buildWelcomeText(firstName) {
	const name = firstName ? `, ${firstName}` : ''
	return (
		`👑 <b>King Kebab Time</b>\n\n` +
		`Salom${name}!\n` +
		`Ish soatlari, overtime va smenalaringiz shu yerda.\n\n` +
		`Pastdagi <b>Open App</b> tugmasini bosing — ilova darhol ochiladi.\n\n` +
		`⏱ Tez · qulay · alohida brauzer kerak emas`
	)
}

/** Always-visible button above the message input (like other Mini App bots). */
function buildPersistentOpenAppKeyboard() {
	return {
		keyboard: [
			[
				{
					text: '🚀 Open App',
					web_app: { url: getMiniAppUrl() },
				},
			],
		],
		resize_keyboard: true,
		is_persistent: true,
		input_field_placeholder: 'Open App tugmasini bosing',
	}
}

/** Extra inline buttons inside the welcome message. */
function buildInlineOpenAppKeyboard() {
	return {
		inline_keyboard: [
			[
				{
					text: '🚀 Open App',
					web_app: { url: getMiniAppUrl() },
				},
			],
			[
				{
					text: '🌐 Brauzerda ochish',
					url: getMiniAppUrl(),
				},
			],
		],
	}
}

async function telegramCall(method, payload) {
	const base = getApiBase()
	if (!base) {
		throw new Error('TELEGRAM_MINI_APP_BOT_TOKEN is not configured')
	}
	const response = await axios.post(`${base}/${method}`, payload)
	return response.data
}

async function sendWelcomeMessage(chatId, firstName) {
	// 1) Welcome + inline Open App
	await telegramCall('sendMessage', {
		chat_id: chatId,
		text: buildWelcomeText(firstName),
		parse_mode: 'HTML',
		disable_web_page_preview: true,
		reply_markup: buildInlineOpenAppKeyboard(),
	})

	// 2) Persistent bottom keyboard (stays after leaving/reopening the chat)
	await telegramCall('sendMessage', {
		chat_id: chatId,
		text: '👇 Asosiy tugma doim pastda turadi:',
		reply_markup: buildPersistentOpenAppKeyboard(),
	})
}

async function setupMiniAppBotProfile() {
	const token = getMiniAppToken()
	if (!token) {
		console.warn('⚠️ Mini App bot setup skipped — token missing')
		return
	}

	const webAppUrl = getMiniAppUrl()

	try {
		await telegramCall('setMyCommands', {
			commands: [
				{ command: 'start', description: 'Boshlash / Open App' },
				{ command: 'app', description: 'Ilovani ochish' },
				{ command: 'help', description: 'Yordam' },
			],
		})

		// Blue/text button next to the attachment area in the chat
		await telegramCall('setChatMenuButton', {
			menu_button: {
				type: 'web_app',
				text: 'Open',
				web_app: { url: webAppUrl },
			},
		})

		await telegramCall('setMyShortDescription', {
			short_description: 'King Kebab — ish soatlari · Open App',
		})

		await telegramCall('setMyDescription', {
			description:
				'King Kebab Time Management.\n\n' +
				'Ish soatlaringizni belgilang, overtime yozing va jamoa bilan sinxron qoling.\n\n' +
				'Pastdagi Open tugmasini bosing yoki /start yuboring.',
		})

		console.log('✅ Mini App bot profile configured →', webAppUrl)
	} catch (error) {
		console.error(
			'❌ Mini App bot profile setup failed:',
			error.response?.data || error.message,
		)
	}
}

async function setupMiniAppWebhook(publicBaseUrl) {
	const token = getMiniAppToken()
	if (!token || !publicBaseUrl) return false

	const base = publicBaseUrl.replace(/\/$/, '')
	const webhookUrl = `${base}/api/telegram-miniapp/webhook`
	const secret =
		process.env.TELEGRAM_MINI_APP_WEBHOOK_SECRET ||
		process.env.JWT_SECRET ||
		''

	try {
		await telegramCall('setWebhook', {
			url: webhookUrl,
			secret_token: secret || undefined,
			allowed_updates: ['message'],
			drop_pending_updates: false,
		})
		console.log('✅ Mini App webhook set →', webhookUrl)
		return true
	} catch (error) {
		console.error(
			'❌ Mini App webhook setup failed:',
			error.response?.data || error.message,
		)
		return false
	}
}

/**
 * Handle a single Telegram Update for the Mini App bot.
 */
async function handleMiniAppUpdate(update) {
	const message = update.message
	if (!message?.chat?.id) return

	const chatId = message.chat.id
	const text = (message.text || '').trim()
	const firstName = message.from?.first_name || ''
	const command = text.split(/\s+/)[0].toLowerCase().replace(/@\w+$/, '')

	if (
		command === '/start' ||
		command === '/app' ||
		command === '/help' ||
		text === 'app' ||
		text === 'start'
	) {
		await sendWelcomeMessage(chatId, firstName)
		return
	}

	// Any other text — remind + keep persistent keyboard
	if (text) {
		await telegramCall('sendMessage', {
			chat_id: chatId,
			text: '👋 Ilovani ochish uchun pastdagi <b>Open App</b> tugmasini bosing.',
			parse_mode: 'HTML',
			reply_markup: buildPersistentOpenAppKeyboard(),
		})
	}
}

function resolvePublicBackendUrl() {
	return (
		process.env.BACKEND_PUBLIC_URL ||
		process.env.RENDER_EXTERNAL_URL ||
		process.env.BACKEND_URL ||
		''
	).replace(/\/$/, '')
}

module.exports = {
	getMiniAppUrl,
	sendWelcomeMessage,
	setupMiniAppBotProfile,
	setupMiniAppWebhook,
	handleMiniAppUpdate,
	resolvePublicBackendUrl,
	buildWelcomeText,
}
