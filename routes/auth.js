const express = require('express')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const telegramService = require('../services/telegramService')
const { validateTelegramWebAppData } = require('../utils/telegramAuth')
const { getTokenFromRequest } = require('../middleware/auth')
const router = express.Router()

const ACCESS_TOKEN_EXPIRES_IN = '24h'
const REFRESH_TOKEN_EXPIRES_IN = '30d'
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ACCESS_REFRESH_WINDOW_SECONDS = 30 * 24 * 60 * 60

function hashToken(token) {
	return crypto.createHash('sha256').update(token).digest('hex')
}

function hashesMatch(left, right) {
	if (!left || !right) return false
	const a = Buffer.from(String(left))
	const b = Buffer.from(String(right))
	if (a.length !== b.length) return false
	return crypto.timingSafeEqual(a, b)
}

function issueAccessToken(user) {
	return jwt.sign(
		{
			userId: user._id,
			isAdmin: user.isAdmin,
			position: user.position,
			username: user.username,
			employeeId: user.employeeId,
			tokenVersion: user.tokenVersion || 0,
		},
		process.env.JWT_SECRET,
		{ expiresIn: ACCESS_TOKEN_EXPIRES_IN },
	)
}

async function issueAuthTokens(user) {
	const token = issueAccessToken(user)
	const refreshToken = jwt.sign(
		{
			userId: user._id,
			type: 'refresh',
			tokenVersion: user.tokenVersion || 0,
		},
		process.env.JWT_SECRET,
		{ expiresIn: REFRESH_TOKEN_EXPIRES_IN },
	)

	user.refreshTokenHash = hashToken(refreshToken)
	user.refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
	await User.updateOne(
		{ _id: user._id },
		{
			$set: {
				refreshTokenHash: user.refreshTokenHash,
				refreshTokenExpiresAt: user.refreshTokenExpiresAt,
				lastLogin: new Date(),
			},
		},
	)

	return { token, refreshToken }
}

function buildAuthResponse(user, tokens) {
	return {
		token: tokens.token,
		refreshToken: tokens.refreshToken,
		position: user.position,
		isAdmin: user.isAdmin,
		username: user.username,
		employeeId: user.employeeId,
	}
}

async function sendAuthResponse(res, user, status = 200) {
	const tokens = await issueAuthTokens(user)
	return res.status(status).json(buildAuthResponse(user, tokens))
}

function getTelegramUserFromInitData(initData) {
	const botToken = process.env.TELEGRAM_MINI_APP_BOT_TOKEN
	if (!botToken) {
		const error = new Error(
			'Telegram Mini App bot is not configured (set TELEGRAM_MINI_APP_BOT_TOKEN)',
		)
		error.status = 500
		throw error
	}

	const telegramUser = validateTelegramWebAppData(initData, botToken)
	if (!telegramUser) {
		const error = new Error('Invalid or expired Telegram data')
		error.status = 401
		throw error
	}

	return telegramUser
}

// Create Admin (SECURED - requires master key or existing admin)
router.post('/create-admin', async (req, res) => {
	try {
		// SECURITY: Require master key from environment OR existing admin authentication
		const masterKey = req.header('X-Master-Key')
		const requiredMasterKey = process.env.MASTER_ADMIN_KEY

		// Check if master key is provided and matches
		if (!masterKey || masterKey !== requiredMasterKey) {
			// If no master key, require admin authentication
			const token = req.header('Authorization')?.replace('Bearer ', '')
			if (token) {
				try {
					const decoded = jwt.verify(token, process.env.JWT_SECRET)
					const user = await User.findById(decoded.userId)
					if (!user || !user.isAdmin) {
						return res.status(403).json({ 
							message: 'Admin access required or valid master key' 
						})
					}
				} catch (error) {
					return res.status(403).json({ 
						message: 'Admin access required or valid master key' 
					})
				}
			} else {
				return res.status(403).json({ 
					message: 'Admin access required or valid master key' 
				})
			}
		}

		const { username, password, position } = req.body

		if (!username || !password || !position) {
			return res.status(400).json({ message: 'All fields are required' })
		}

		const existingUser = await User.findOne({ username })
		if (existingUser) {
			return res.status(400).json({ message: 'Username already exists' })
		}

		// Hash password before saving
		const hashedPassword = await bcrypt.hash(password, 10)

		const user = new User({
			username,
			password: hashedPassword,
			position,
			isAdmin: true,
		})
		await user.save()

		const clientIp = req.ip || req.connection.remoteAddress
		console.log(`🔐 SECURITY EVENT: Admin user created`)
		console.log(`   Username: ${username}`)
		console.log(`   IP Address: ${clientIp}`)
		console.log(`   Timestamp: ${new Date().toISOString()}`)
		console.log(`   User-Agent: ${req.get('user-agent') || 'Unknown'}`)

		return sendAuthResponse(res, user, 201)
	} catch (error) {
		console.error('Create admin error:', error)
		res.status(500).json({ message: 'Error creating admin user' })
	}
})

// Register
router.post('/register', async (req, res) => {
	try {
		const { username, password, position, employeeId } = req.body

		// Validate input
		if (!username || !password || !position || !employeeId) {
			return res.status(400).json({ message: "Barcha maydonlarni to'ldiring" })
		}

		// Check if username exists
		const existingUsername = await User.findOne({ username })
		if (existingUsername) {
			return res.status(400).json({ message: 'Bu username allaqachon mavjud' })
		}

		// Check if employeeId exists
		const existingEmployeeId = await User.findOne({ employeeId })
		if (existingEmployeeId) {
			return res
				.status(400)
				.json({ message: 'Bu employee ID allaqachon mavjud' })
		}

		// Hash password
		const hashedPassword = await bcrypt.hash(password, 10)

		// Create new user
		const user = new User({
			username,
			password: hashedPassword,
			position,
			employeeId,
		})

		await user.save()

		// Send Telegram notification for new user registration
		try {
			await telegramService.sendUserRegistrationNotification(user)
		} catch (telegramError) {
			console.error('Telegram notification error:', telegramError.message)
			// Don't fail the request if Telegram fails
		}

		return sendAuthResponse(res, user, 201)
	} catch (error) {
		console.error('Registration error:', error)
		res.status(500).json({ message: "Ro'yxatdan o'tishda xatolik yuz berdi" })
	}
})

// Login
router.post('/login', async (req, res) => {
	try {
		const { username, password } = req.body

		// Find user
		const user = await User.findOne({ username })
		if (!user) {
			return res.status(400).json({ message: "Login yoki parol noto'g'ri" })
		}

		// Check password
		const isMatch = await bcrypt.compare(password, user.password)
		if (!isMatch) {
			return res.status(400).json({ message: "Login yoki parol noto'g'ri" })
		}

		if (user.isActive === false) {
			return res.status(403).json({ message: 'Account is inactive' })
		}

		user.lastLogin = new Date()
		return sendAuthResponse(res, user)
	} catch (error) {
		console.error('Login error:', error)
		res.status(500).json({ message: 'Kirishda xatolik yuz berdi' })
	}
})

// Forgot password: verify employee ID exists (no token, lean flow)
router.post('/forgot-password', async (req, res) => {
	try {
		const employeeId = (req.body.employeeId || '').trim()
		if (!employeeId) {
			return res.status(400).json({ message: 'Enter your Employee ID' })
		}
		const user = await User.findOne({ employeeId }).select('_id')
		if (!user) {
			return res.status(404).json({ message: 'Employee ID not found' })
		}
		res.json({ message: 'Employee ID verified' })
	} catch (error) {
		console.error('Forgot password error:', error)
		res.status(500).json({ message: 'Something went wrong' })
	}
})

// Reset password: set new password by employee ID
router.post('/reset-password', async (req, res) => {
	try {
		const { employeeId, newPassword } = req.body
		const pwd = (newPassword || '').trim()
		if (!(employeeId && pwd)) {
			return res.status(400).json({ message: 'Employee ID and new password are required' })
		}
		if (pwd.length < 6) {
			return res.status(400).json({ message: 'Password must be at least 6 characters' })
		}
		const user = await User.findOne({ employeeId })
		if (!user) {
			return res.status(404).json({ message: 'Employee ID not found' })
		}
		user.password = await bcrypt.hash(pwd, 10)
		await user.save()
		res.json({ message: 'Password updated' })
	} catch (error) {
		console.error('Reset password error:', error)
		res.status(500).json({ message: 'Something went wrong' })
	}
})

// Telegram Mini App: auto-login if account is already linked
router.post('/telegram', async (req, res) => {
	try {
		const { initData } = req.body
		if (!initData) {
			return res.status(400).json({ message: 'Telegram initData is required' })
		}

		const telegramUser = getTelegramUserFromInitData(initData)
		const telegramId = String(telegramUser.id)

		const user = await User.findOne({ telegramId })
		if (!user) {
			return res.status(404).json({
				message: 'Telegram account is not linked',
				code: 'TELEGRAM_NOT_LINKED',
				telegram: {
					id: telegramId,
					username: telegramUser.username || '',
					firstName: telegramUser.first_name || '',
				},
			})
		}

		if (user.isActive === false) {
			return res.status(403).json({ message: 'Account is inactive' })
		}

		user.lastLogin = new Date()
		if (telegramUser.username) {
			user.telegramUsername = telegramUser.username
		}
		await user.save()

		return sendAuthResponse(res, user)
	} catch (error) {
		console.error('Telegram login error:', error)
		res.status(error.status || 500).json({
			message: error.message || 'Telegram login failed',
		})
	}
})

// Telegram Mini App: link existing account once, then auto-login next time
router.post('/telegram/link', async (req, res) => {
	try {
		const { initData, username, password } = req.body
		if (!initData || !username || !password) {
			return res.status(400).json({
				message: 'initData, username and password are required',
			})
		}

		const telegramUser = getTelegramUserFromInitData(initData)
		const telegramId = String(telegramUser.id)

		const existingLink = await User.findOne({ telegramId })
		if (existingLink) {
			return sendAuthResponse(res, existingLink)
		}

		const user = await User.findOne({ username })
		if (!user) {
			return res.status(400).json({ message: "Login yoki parol noto'g'ri" })
		}

		const isMatch = await bcrypt.compare(password, user.password)
		if (!isMatch) {
			return res.status(400).json({ message: "Login yoki parol noto'g'ri" })
		}

		if (user.isActive === false) {
			return res.status(403).json({ message: 'Account is inactive' })
		}

		if (user.telegramId && user.telegramId !== telegramId) {
			return res.status(409).json({
				message: 'This account is already linked to another Telegram user',
			})
		}

		user.telegramId = telegramId
		user.telegramUsername = telegramUser.username || ''
		user.lastLogin = new Date()
		await user.save()

		return sendAuthResponse(res, user)
	} catch (error) {
		console.error('Telegram link error:', error)
		res.status(error.status || 500).json({
			message: error.message || 'Failed to link Telegram account',
		})
	}
})

// Telegram Mini App: attach Telegram to the already authenticated session
router.post('/telegram/attach', async (req, res) => {
	try {
		const { initData } = req.body
		const authHeader = req.header('Authorization')
		const sessionToken = authHeader?.startsWith('Bearer ')
			? authHeader.replace('Bearer ', '').trim()
			: null

		if (!initData || !sessionToken) {
			return res.status(400).json({
				message: 'initData and Authorization bearer token are required',
			})
		}

		let decoded
		try {
			decoded = jwt.verify(sessionToken, process.env.JWT_SECRET)
			if (decoded.type === 'refresh') {
				return res.status(401).json({ message: 'Invalid session' })
			}
		} catch {
			return res.status(401).json({ message: 'Invalid session' })
		}

		const telegramUser = getTelegramUserFromInitData(initData)
		const telegramId = String(telegramUser.id)

		const existingLink = await User.findOne({ telegramId })
		if (existingLink && String(existingLink._id) !== String(decoded.userId)) {
			return res.status(409).json({
				message: 'This Telegram account is already linked to another user',
			})
		}

		const user = await User.findById(decoded.userId)
		if (!user) {
			return res.status(404).json({ message: 'User not found' })
		}

		user.telegramId = telegramId
		user.telegramUsername = telegramUser.username || ''
		await user.save()

		return sendAuthResponse(res, user)
	} catch (error) {
		console.error('Telegram attach error:', error)
		res.status(error.status || 500).json({
			message: error.message || 'Failed to attach Telegram account',
		})
	}
})

router.post('/refresh', async (req, res) => {
	try {
		const presentedRefresh =
			typeof req.body?.refreshToken === 'string'
				? req.body.refreshToken.trim()
				: ''
		const presentedAccess = getTokenFromRequest(req)

		if (presentedRefresh) {
			try {
				const decoded = jwt.verify(presentedRefresh, process.env.JWT_SECRET)
				if (decoded.type !== 'refresh' || !decoded.userId) {
					return res.status(401).json({
						message: 'Session expired',
						code: 'SESSION_EXPIRED',
					})
				}

				const user = await User.findById(decoded.userId)
				if (!user || user.isActive === false) {
					return res.status(401).json({
						message: 'Session expired',
						code: 'SESSION_EXPIRED',
					})
				}

				if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
					return res.status(401).json({
						message: 'Session expired',
						code: 'SESSION_EXPIRED',
					})
				}

				if (
					!hashesMatch(user.refreshTokenHash, hashToken(presentedRefresh))
				) {
					return res.status(401).json({
						message: 'Session expired',
						code: 'SESSION_EXPIRED',
					})
				}

				user.lastLogin = new Date()
				return sendAuthResponse(res, user)
			} catch (error) {
				if (error.name !== 'TokenExpiredError' || !presentedAccess) {
					return res.status(401).json({
						message: 'Session expired',
						code: 'SESSION_EXPIRED',
					})
				}
			}
		}

		if (presentedAccess) {
			const decoded = jwt.verify(presentedAccess, process.env.JWT_SECRET, {
				ignoreExpiration: true,
			})

			if (decoded.type === 'refresh' || !decoded.userId) {
				return res.status(401).json({
					message: 'Session expired',
					code: 'SESSION_EXPIRED',
				})
			}

			const issuedAt = Number(decoded.iat || 0)
			if (
				!issuedAt ||
				Math.floor(Date.now() / 1000) - issuedAt > ACCESS_REFRESH_WINDOW_SECONDS
			) {
				return res.status(401).json({
					message: 'Session expired',
					code: 'SESSION_EXPIRED',
				})
			}

			const user = await User.findById(decoded.userId)
			if (!user || user.isActive === false) {
				return res.status(401).json({
					message: 'Session expired',
					code: 'SESSION_EXPIRED',
				})
			}

			if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
				return res.status(401).json({
					message: 'Session expired',
					code: 'SESSION_EXPIRED',
				})
			}

			user.lastLogin = new Date()
			return sendAuthResponse(res, user)
		}

		return res.status(401).json({
			message: 'Session expired',
			code: 'SESSION_EXPIRED',
		})
	} catch (error) {
		console.error('Refresh error:', error)
		return res.status(401).json({
			message: 'Session expired',
			code: 'SESSION_EXPIRED',
		})
	}
})

router.post('/logout', async (req, res) => {
	try {
		const presentedRefresh =
			typeof req.body?.refreshToken === 'string'
				? req.body.refreshToken.trim()
				: ''
		const presentedAccess = getTokenFromRequest(req)
		const presented = presentedRefresh || presentedAccess

		if (presented) {
			try {
				const decoded = jwt.verify(presented, process.env.JWT_SECRET, {
					ignoreExpiration: true,
				})
				if (decoded.userId) {
					await User.updateOne(
						{ _id: decoded.userId },
						{
							$inc: { tokenVersion: 1 },
							$set: {
								refreshTokenHash: null,
								refreshTokenExpiresAt: null,
							},
						},
					)
				}
			} catch {
				// already signed out locally
			}
		}

		return res.json({ ok: true })
	} catch (error) {
		console.error('Logout error:', error)
		return res.json({ ok: true })
	}
})

module.exports = router
