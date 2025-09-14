const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const telegramService = require('../services/telegramService')
const router = express.Router()

// Create Admin (maxsus endpoint)
router.post('/create-admin', async (req, res) => {
	try {
		const { username, password, position } = req.body

		const existingUser = await User.findOne({ username })
		if (existingUser) {
			return res.status(400).json({ message: 'Username already exists' })
		}

		const user = new User({
			username,
			password,
			position,
			isAdmin: true, // Admin huquqi bilan yaratish
		})
		await user.save()

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
