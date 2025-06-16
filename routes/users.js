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
		const { username, password, position, isAdmin, employeeId } = req.body

		const existingUser = await User.findOne({
			$or: [{ username }, { employeeId }],
		})
		if (existingUser) {
			return res
				.status(400)
				.json({ message: 'Username or Employee ID already exists' })
		}

		const user = new User({
			username,
			password,
			position,
			employeeId,
			isAdmin: isAdmin || false,
		})
		await user.save()

		res.status(201).json({
			_id: user._id,
			username: user.username,
			position: user.position,
			isAdmin: user.isAdmin,
			employeeId: user.employeeId,
		})
	} catch (err) {
		console.error('Create user error:', err)
		res.status(500).json({ message: 'Server xatosi' })
	}
})

// Register new worker (admin only)
router.post('/register', adminAuth, async (req, res) => {
	try {
		const { username, password, position, isAdmin, employeeId } = req.body

		// Validate input
		if (!username || !password || !position || !employeeId) {
			return res.status(400).json({ message: 'All fields are required' })
		}

		// Check if username or employeeId exists
		const existingUser = await User.findOne({
			$or: [{ username }, { employeeId }],
		})
		if (existingUser) {
			return res
				.status(400)
				.json({ message: 'Username or Employee ID already exists' })
		}

		// Create new user
		const user = new User({
			username,
			password,
			position,
			isAdmin: isAdmin || false,
			employeeId,
		})

		await user.save()

		res.status(201).json({
			message: 'Worker registered successfully',
			user: {
				id: user._id,
				username: user.username,
				position: user.position,
				isAdmin: user.isAdmin,
				employeeId: user.employeeId,
			},
		})
	} catch (error) {
		console.error('Error registering worker:', error)
		res.status(500).json({ message: 'Error registering worker' })
	}
})

// Get all workers (admin only)
router.get('/list', adminAuth, async (req, res) => {
	try {
		const users = await User.find({}, 'username position employeeId isAdmin')
		res.json(users)
	} catch (error) {
		res.status(500).json({ message: 'Error fetching users' })
	}
})

// Register new worker (admin only)
router.post('/register-worker', adminAuth, async (req, res) => {
	try {
		const { username, password, position, employeeId } = req.body

		// Check if user already exists
		const existingUser = await User.findOne({
			$or: [{ username }, { employeeId }],
		})
		if (existingUser) {
			return res.status(400).json({
				message: 'Username or Employee ID already exists',
			})
		}

		// Create new worker
		const worker = new User({
			username,
			password,
			position,
			employeeId,
			isAdmin: false,
		})

		await worker.save()

		res.status(201).json({
			message: 'Worker registered successfully',
			worker: {
				id: worker._id,
				username: worker.username,
				position: worker.position,
				employeeId: worker.employeeId,
			},
		})
	} catch (error) {
		console.error('Worker registration error:', error)
		res.status(500).json({
			message: 'Error registering worker',
			error: error.message,
		})
	}
})

module.exports = router
