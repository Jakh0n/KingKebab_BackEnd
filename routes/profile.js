const express = require('express')
const router = express.Router()
const User = require('../models/User')
const { auth } = require('../middleware/auth')

// Update user profile
router.put('/', auth, async (req, res) => {
	try {
		const updates = {}

		// Only add fields that are provided
		if (req.body.name) updates.name = req.body.name
		if (req.body.photoUrl) updates.photoUrl = req.body.photoUrl

		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ $set: updates },
			{ new: true, runValidators: true }
		).select('-password')

		if (!user) {
			return res.status(404).json({ message: 'User not found' })
		}

		res.json(user)
	} catch (error) {
		console.error('Profile update error:', error)
		res.status(500).json({ message: 'Error updating profile' })
	}
})

// Get user profile
router.get('/', auth, async (req, res) => {
	try {
		const user = await User.findById(req.user._id).select('-password')
		if (!user) {
			return res.status(404).json({ message: 'User not found' })
		}
		res.json(user)
	} catch (error) {
		console.error('Profile fetch error:', error)
		res.status(500).json({ message: 'Error fetching profile' })
	}
})

module.exports = router
