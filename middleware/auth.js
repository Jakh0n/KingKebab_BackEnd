const jwt = require('jsonwebtoken')
const User = require('../models/User')

const auth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')

		if (!token) {
			return res.status(401).json({ message: 'No token provided' })
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)
		const user = await User.findById(decoded.userId)

		if (!user) {
			return res.status(401).json({ message: 'User not found' })
		}

		req.user = {
			id: user._id,
			username: user.username,
			position: user.position,
			employeeId: user.employeeId,
			isAdmin: user.isAdmin,
		}
		req.token = token

		next()
	} catch (error) {
		res.status(401).json({ message: 'Please authenticate' })
	}
}

const adminAuth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')
		if (!token) {
			return res
				.status(401)
				.json({ message: 'Authentication token is required' })
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)

		// Verify user still exists and is admin
		const user = await User.findById(decoded.userId)
		if (!user) {
			return res.status(401).json({ message: 'User no longer exists' })
		}
		if (!user.isAdmin) {
			return res.status(403).json({ message: 'Admin access required' })
		}

		req.user = {
			_id: decoded.userId,
			userId: decoded.userId,
			position: decoded.position,
			username: decoded.username,
			isAdmin: decoded.isAdmin,
			employeeId: decoded.employeeId,
		}
		next()
	} catch (error) {
		if (error.name === 'JsonWebTokenError') {
			return res.status(401).json({ message: 'Invalid token' })
		}
		if (error.name === 'TokenExpiredError') {
			return res.status(401).json({ message: 'Token has expired' })
		}
		res.status(401).json({ message: error.message || 'Authentication failed' })
	}
}

module.exports = { auth, adminAuth }
