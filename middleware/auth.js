const jwt = require('jsonwebtoken')

const auth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')
		if (!token) {
			throw new Error()
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)
		req.user = {
			_id: decoded.userId,
			userId: decoded.userId,
			position: decoded.position,
			username: decoded.username,
		}
		next()
	} catch (error) {
		res.status(401).json({ message: 'Please authenticate' })
	}
}

const adminAuth = async (req, res, next) => {
	try {
		const token = req.header('Authorization')?.replace('Bearer ', '')
		if (!token) {
			throw new Error()
		}

		const decoded = jwt.verify(token, process.env.JWT_SECRET)
		if (!decoded.isAdmin) {
			throw new Error('Admin access required')
		}

		req.user = {
			_id: decoded.userId,
			userId: decoded.userId,
			position: decoded.position,
			username: decoded.username,
			isAdmin: decoded.isAdmin,
		}
		next()
	} catch (error) {
		res.status(401).json({ message: error.message || 'Please authenticate' })
	}
}

module.exports = { auth, adminAuth }
