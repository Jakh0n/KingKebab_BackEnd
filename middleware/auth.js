const jwt = require('jsonwebtoken')
const User = require('../models/User')

const auth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')
		if (!token) {
			throw new Error('Token not found')
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)

		// Foydalanuvchi bazada mavjudligini tekshirish
		const user = await User.findById(decoded.userId)
		if (!user) {
			throw new Error('User not found')
		}

		// Token ma'lumotlari user ma'lumotlariga mos kelishini tekshirish
		if (
			user.username !== decoded.username ||
			user.position !== decoded.position ||
			user.employeeId !== decoded.employeeId
		) {
			throw new Error('Token data mismatch')
		}

		req.user = {
			_id: user._id,
			userId: user._id,
			position: user.position,
			username: user.username,
			employeeId: user.employeeId,
			isAdmin: user.isAdmin,
		}
		next()
	} catch (error) {
		res.status(401).json({ message: error.message || 'Please authenticate' })
	}
}

const adminAuth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')
		if (!token) {
			throw new Error('Token not found')
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)

		// Foydalanuvchi bazada mavjudligini tekshirish
		const user = await User.findById(decoded.userId)
		if (!user) {
			throw new Error('User not found')
		}

		// Admin huquqi tekshirish
		if (!user.isAdmin) {
			throw new Error('Admin access required')
		}

		// Token ma'lumotlari user ma'lumotlariga mos kelishini tekshirish
		if (
			user.username !== decoded.username ||
			user.position !== decoded.position ||
			user.employeeId !== decoded.employeeId
		) {
			throw new Error('Token data mismatch')
		}

		req.user = {
			_id: user._id,
			userId: user._id,
			position: user.position,
			username: user.username,
			employeeId: user.employeeId,
			isAdmin: user.isAdmin,
		}
		next()
	} catch (error) {
		res.status(401).json({ message: error.message || 'Please authenticate' })
	}
}

// Alias for adminAuth for backward compatibility
const isAdmin = adminAuth

module.exports = { auth, adminAuth, isAdmin }
