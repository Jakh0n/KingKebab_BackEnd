const express = require('express')
const router = express.Router()
const Announcement = require('../models/Announcement')
const { auth, adminAuth } = require('../middleware/auth')

// Get all announcements
router.get('/', auth, async (req, res) => {
	try {
		const announcements = await Announcement.find().sort({ createdAt: -1 })
		res.json(announcements)
	} catch (error) {
		console.error('Error fetching announcements:', error)
		res.status(500).json({ message: 'Error loading announcements' })
	}
})

// Create new announcement (admin only)
router.post('/', adminAuth, async (req, res) => {
	try {
		const { title, content, type } = req.body

		if (!title || !content) {
			return res.status(400).json({ message: 'Title and content are required' })
		}

		const announcement = new Announcement({
			title,
			content,
			type: type || 'info',
		})

		await announcement.save()
		res.status(201).json(announcement)
	} catch (error) {
		console.error('Error creating announcement:', error)
		res.status(500).json({ message: 'Error creating announcement' })
	}
})

// Update announcement (admin only)
router.put('/:id', adminAuth, async (req, res) => {
	try {
		const { title, content, type, isActive } = req.body
		const announcement = await Announcement.findById(req.params.id)

		if (!announcement) {
			return res.status(404).json({ message: 'Announcement not found' })
		}

		announcement.title = title || announcement.title
		announcement.content = content || announcement.content
		announcement.type = type || announcement.type
		announcement.isActive =
			isActive !== undefined ? isActive : announcement.isActive

		await announcement.save()
		res.json(announcement)
	} catch (error) {
		console.error('Error updating announcement:', error)
		res.status(500).json({ message: 'Error updating announcement' })
	}
})

// Delete announcement (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
	try {
		const announcement = await Announcement.findById(req.params.id)

		if (!announcement) {
			return res.status(404).json({ message: 'Announcement not found' })
		}

		await announcement.deleteOne()
		res.json({ message: 'Announcement deleted successfully' })
	} catch (error) {
		console.error('Error deleting announcement:', error)
		res.status(500).json({ message: 'Error deleting announcement' })
	}
})

module.exports = router
