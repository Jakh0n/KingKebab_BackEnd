const jwt = require('jsonwebtoken')
const User = require('../models/User')

const AUTH_ERROR_MESSAGE = 'Please authenticate'

/**
 * Extracts Bearer token from Authorization header.
 * @param {import('express').Request} req
 * @returns {string | null}
 */
function getTokenFromRequest(req) {
	const header = req.header('Authorization')
	if (!header || !header.startsWith('Bearer ')) return null
	return header.replace('Bearer ', '').trim()
}

/**
 * Verifies JWT, loads user from DB, validates token payload matches user, attaches req.user.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {Promise<void>}
 */
async function verifyAndAttachUser(req, res, next) {
	try {
		const token = getTokenFromRequest(req)
		if (!token) {
			throw new Error('Token not found')
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)
		const user = await User.findById(decoded.userId)
		if (!user) {
			throw new Error('User not found')
		}

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
		res.status(401).json({ message: error.message || AUTH_ERROR_MESSAGE })
	}
}

/** Any authenticated user */
const auth = verifyAndAttachUser

/** Authenticated user with isAdmin required */
const adminAuth = (req, res, next) => {
	verifyAndAttachUser(req, res, () => {
		if (!req.user?.isAdmin) {
			return res.status(403).json({ message: 'Admin access required' })
		}
		next()
	})
}

const isAdmin = adminAuth

module.exports = { auth, adminAuth, isAdmin, verifyAndAttachUser, getTokenFromRequest }
