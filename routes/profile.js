const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const router = express.Router()
const User = require('../models/User')
const { auth } = require('../middleware/auth')

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/profiles')
if (!fs.existsSync(uploadsDir)) {
	fs.mkdirSync(uploadsDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		cb(null, uploadsDir)
	},
	filename: (req, file, cb) => {
		// Create unique filename: userId_timestamp_originalname
		const uniqueName = `${req.user._id}_${Date.now()}_${file.originalname}`
		cb(null, uniqueName)
	},
})

const fileFilter = (req, file, cb) => {
	// Check if file is an image
	if (file.mimetype.startsWith('image/')) {
		cb(null, true)
	} else {
		cb(new Error('Only image files are allowed!'), false)
	}
}

const upload = multer({
	storage: storage,
	fileFilter: fileFilter,
	limits: {
		fileSize: 2 * 1024 * 1024, // 2MB limit
	},
})

// Upload profile image
router.post('/upload-image', auth, upload.single('image'), async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({ message: 'No image file provided' })
		}

		// Create the URL for the uploaded file
		const imageUrl = `/uploads/profiles/${req.file.filename}`

		// Update user's photoUrl in database
		const user = await User.findByIdAndUpdate(
			req.user._id,
			{ photoUrl: imageUrl },
			{ new: true }
		).select('-password')

		res.json({
			message: 'Image uploaded successfully',
			imageUrl: imageUrl,
			user: user,
		})
	} catch (error) {
		console.error('Image upload error:', error)
		res.status(500).json({ message: 'Error uploading image' })
	}
})

// Update user profile
router.put('/', auth, async (req, res) => {
	try {
		const updates = {}

		// Add all fields that are provided
		if (req.body.name) updates.name = req.body.name
		if (req.body.email) updates.email = req.body.email
		if (req.body.phone) updates.phone = req.body.phone
		if (req.body.bio) updates.bio = req.body.bio
		if (req.body.department) updates.department = req.body.department
		if (req.body.photoUrl) updates.photoUrl = req.body.photoUrl
		if (req.body.hireDate) updates.hireDate = req.body.hireDate
		if (req.body.skills) updates.skills = req.body.skills
		if (req.body.emergencyContact)
			updates.emergencyContact = req.body.emergencyContact
		if (req.body.hourlyWage !== undefined)
			updates.hourlyWage = req.body.hourlyWage

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
