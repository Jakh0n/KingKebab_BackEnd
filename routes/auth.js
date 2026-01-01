const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const telegramService = require('../services/telegramService')
const router = express.Router()

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

		// Log security event with IP address
		const clientIp = req.ip || req.connection.remoteAddress
		console.log(`🔐 SECURITY EVENT: Admin user created`)
		console.log(`   Username: ${username}`)
		console.log(`   IP Address: ${clientIp}`)
		console.log(`   Timestamp: ${new Date().toISOString()}`)
		console.log(`   User-Agent: ${req.get('user-agent') || 'Unknown'}`)

		const token = jwt.sign(
			{
				userId: user._id,
				isAdmin: true,
				position: user.position,
				username: user.username,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '24h' }
		)

		res.status(201).json({
			token,
			position: user.position,
			isAdmin: true,
			username: user.username,
		})
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

		// Generate JWT token
		const token = jwt.sign(
			{
				userId: user._id,
				isAdmin: user.isAdmin,
				position: user.position,
				username: user.username,
				employeeId: user.employeeId,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '24h' }
		)

		res.status(201).json({
			token,
			position: user.position,
			isAdmin: user.isAdmin,
			username: user.username,
			employeeId: user.employeeId,
		})
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

		// Generate JWT token
		const token = jwt.sign(
			{
				userId: user._id,
				isAdmin: user.isAdmin,
				position: user.position,
				username: user.username,
				employeeId: user.employeeId,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '24h' }
		)

		res.json({
			token,
			position: user.position,
			isAdmin: user.isAdmin,
			username: user.username,
			employeeId: user.employeeId,
		})
	} catch (error) {
		console.error('Login error:', error)
		res.status(500).json({ message: 'Kirishda xatolik yuz berdi' })
	}
})

module.exports = router
