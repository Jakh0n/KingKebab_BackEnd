const express = require('express')
const router = express.Router()
const User = require('../models/User')
const { isAdmin } = require('../middleware/auth')

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

module.exports = router
