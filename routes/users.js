const express = require('express')
const router = express.Router()
const User = require('../models/User')
const { isAdmin, adminAuth } = require('../middleware/auth')

// Get all users (admin only)
router.get('/', isAdmin, async (req, res) => {
	try {
		const users = await User.find({}, { password: 0 })
		res.json(users)
	} catch (err) {
		console.error('Get users error:', err)
		res.status(500).json({ message: 'Server xatosi' })
	}
})

// Create new user (admin only)
router.post('/', isAdmin, async (req, res) => {
	try {
		const { username, password, position, isAdmin } = req.body

		const existingUser = await User.findOne({ username })
		if (existingUser) {
			return res
				.status(400)
				.json({ message: 'Bunday foydalanuvchi nomi mavjud' })
		}

		const user = new User({
			username,
			password,
			position,
			isAdmin: isAdmin || false,
		})
		await user.save()

		res.status(201).json({
			_id: user._id,
			username: user.username,
			position: user.position,
			isAdmin: user.isAdmin,
		})
	} catch (err) {
		console.error('Create user error:', err)
		res.status(500).json({ message: 'Server xatosi' })
	}
})

// Register new worker (admin only)
router.post('/register', adminAuth, async (req, res) => {
	try {
		const { username, password, position, isAdmin } = req.body

		// Validate input
		if (!username || !password || !position) {
			return res.status(400).json({ message: 'All fields are required' })
		}

		// Check if username exists
		const existingUser = await User.findOne({ username })
		if (existingUser) {
			return res.status(400).json({ message: 'Username already exists' })
		}

		// Create new user
		const user = new User({
			username,
			password,
			position,
			isAdmin: isAdmin || false,
		})

		await user.save()

		res.status(201).json({
			message: 'Worker registered successfully',
			user: {
				id: user._id,
				username: user.username,
				position: user.position,
				isAdmin: user.isAdmin,
			},
		})
	} catch (error) {
		console.error('Error registering worker:', error)
		res.status(500).json({ message: 'Error registering worker' })
	}
})

module.exports = router
