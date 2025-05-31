const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
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
		const { username, password, position } = req.body

		const existingUser = await User.findOne({ username })
		if (existingUser) {
			return res.status(400).json({ message: 'Username already exists' })
		}

		const user = new User({
			username,
			password,
			position,
		})
		await user.save()

		const token = jwt.sign(
			{
				userId: user._id,
				isAdmin: user.isAdmin,
				position: user.position,
				username: user.username,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '24h' }
		)

		res.status(201).json({
			token,
			position: user.position,
			isAdmin: user.isAdmin,
			username: user.username,
		})
	} catch (error) {
		res.status(500).json({ message: 'Error registering user' })
	}
})

// Login
router.post('/login', async (req, res) => {
	try {
		const { username, password } = req.body
		const user = await User.findOne({ username })

		if (!user) {
			return res.status(400).json({ message: 'Invalid credentials' })
		}

		const isMatch = await bcrypt.compare(password, user.password)
		if (!isMatch) {
			return res.status(400).json({ message: 'Invalid credentials' })
		}

		const token = jwt.sign(
			{
				userId: user._id,
				isAdmin: user.isAdmin,
				position: user.position,
				username: user.username,
			},
			process.env.JWT_SECRET,
			{ expiresIn: '24h' }
		)

		res.json({
			token,
			position: user.position,
			isAdmin: user.isAdmin,
			username: user.username,
		})
	} catch (error) {
		res.status(500).json({ message: 'Error logging in' })
	}
})

module.exports = router
