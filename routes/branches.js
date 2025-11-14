const express = require('express')
const router = express.Router()
const Branch = require('../models/Branch')
const { adminAuth } = require('../middleware/auth')

// Get all branches (admin only)
router.get('/', adminAuth, async (req, res) => {
	try {
		const { includeInactive } = req.query

		let query = {}
		if (!includeInactive) {
			query.isActive = true
		}

		const branches = await Branch.find(query).sort({ name: 1 })
		res.json(branches)
	} catch (error) {
		console.error('Get branches error:', error)
		res.status(500).json({ message: 'Error fetching branches' })
	}
})

// Get single branch by ID (admin only)
router.get('/:id', adminAuth, async (req, res) => {
	try {
		const branch = await Branch.findById(req.params.id)

		if (!branch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		res.json(branch)
	} catch (error) {
		console.error('Get branch error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid branch ID' })
		}
		res.status(500).json({ message: 'Error fetching branch' })
	}
})

// Create new branch (admin only)
router.post('/', adminAuth, async (req, res) => {
	try {
		const {
			name,
			code,
			location,
			contact,
			operatingHours,
			capacity,
			requirements,
			notes,
		} = req.body

		// Validate required fields
		if (!name || !code || !location?.address || !location?.city) {
			return res.status(400).json({
				message: 'Name, code, address, and city are required',
			})
		}

		// Check if branch name or code already exists
		const existingBranch = await Branch.findOne({
			$or: [{ name }, { code: code.toUpperCase() }],
		})

		if (existingBranch) {
			return res.status(400).json({
				message:
					existingBranch.name === name
						? 'Branch name already exists'
						: 'Branch code already exists',
			})
		}

		const branch = new Branch({
			name,
			code: code.toUpperCase(),
			location,
			contact,
			operatingHours,
			capacity,
			requirements,
			notes,
		})

		await branch.save()

		res.status(201).json({
			message: 'Branch created successfully',
			branch,
		})
	} catch (error) {
		console.error('Create branch error:', error)
		if (error.name === 'ValidationError') {
			return res.status(400).json({
				message: 'Validation error',
				details: error.message,
			})
		}
		res.status(500).json({ message: 'Error creating branch' })
	}
})

// Update branch (admin only)
router.put('/:id', adminAuth, async (req, res) => {
	try {
		const {
			name,
			code,
			location,
			contact,
			operatingHours,
			capacity,
			requirements,
			notes,
			isActive,
		} = req.body

		const branch = await Branch.findById(req.params.id)

		if (!branch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		// Check if new name or code conflicts with other branches
		if (name && name !== branch.name) {
			const nameExists = await Branch.findOne({
				name,
				_id: { $ne: req.params.id },
			})
			if (nameExists) {
				return res.status(400).json({ message: 'Branch name already exists' })
			}
		}

		if (code && code.toUpperCase() !== branch.code) {
			const codeExists = await Branch.findOne({
				code: code.toUpperCase(),
				_id: { $ne: req.params.id },
			})
			if (codeExists) {
				return res.status(400).json({ message: 'Branch code already exists' })
			}
		}

		// Update fields
		if (name) branch.name = name
		if (code) branch.code = code.toUpperCase()
		if (location) branch.location = { ...branch.location, ...location }
		if (contact) branch.contact = { ...branch.contact, ...contact }
		if (operatingHours)
			branch.operatingHours = { ...branch.operatingHours, ...operatingHours }
		if (capacity) branch.capacity = { ...branch.capacity, ...capacity }
		if (requirements)
			branch.requirements = { ...branch.requirements, ...requirements }
		if (notes !== undefined) branch.notes = notes
		if (isActive !== undefined) branch.isActive = isActive

		await branch.save()

		res.json({
			message: 'Branch updated successfully',
			branch,
		})
	} catch (error) {
		console.error('Update branch error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid branch ID' })
		}
		if (error.name === 'ValidationError') {
			return res.status(400).json({
				message: 'Validation error',
				details: error.message,
			})
		}
		res.status(500).json({ message: 'Error updating branch' })
	}
})

// Delete branch (soft delete - admin only)
router.delete('/:id', adminAuth, async (req, res) => {
	try {
		const branch = await Branch.findById(req.params.id)

		if (!branch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		// Soft delete by setting isActive to false
		branch.isActive = false
		await branch.save()

		res.json({
			message: 'Branch deactivated successfully',
			branch,
		})
	} catch (error) {
		console.error('Delete branch error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid branch ID' })
		}
		res.status(500).json({ message: 'Error deactivating branch' })
	}
})

// Permanently delete branch (admin only) - use with caution
router.delete('/:id/permanent', adminAuth, async (req, res) => {
	try {
		const branch = await Branch.findById(req.params.id)

		if (!branch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		// Check if branch has any schedules (would need Schedule model import)
		// This is a safety check to prevent data integrity issues
		// const scheduleCount = await Schedule.countDocuments({ branch: req.params.id })
		// if (scheduleCount > 0) {
		// 	return res.status(400).json({
		// 		message: 'Cannot delete branch with existing schedules. Deactivate instead.'
		// 	})
		// }

		await Branch.findByIdAndDelete(req.params.id)

		res.json({
			message: 'Branch permanently deleted',
		})
	} catch (error) {
		console.error('Permanent delete branch error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid branch ID' })
		}
		res.status(500).json({ message: 'Error permanently deleting branch' })
	}
})

// Get active branches (for public use, no auth required)
router.get('/public/active', async (req, res) => {
	try {
		const branches = await Branch.findActive().select(
			'name code location.address location.city operatingHours'
		)
		res.json(branches)
	} catch (error) {
		console.error('Get active branches error:', error)
		res.status(500).json({ message: 'Error fetching active branches' })
	}
})

// Get branch operating hours for a specific day
router.get('/:id/hours/:day', adminAuth, async (req, res) => {
	try {
		const { day } = req.params
		const branch = await Branch.findById(req.params.id)

		if (!branch) {
			return res.status(404).json({ message: 'Branch not found' })
		}

		const hours = branch.getHoursForDay(day)

		if (!hours) {
			return res.json({
				isOpen: false,
				message: `Branch is closed on ${day}`,
			})
		}

		res.json({
			isOpen: true,
			day,
			...hours,
		})
	} catch (error) {
		console.error('Get branch hours error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid branch ID' })
		}
		res.status(500).json({ message: 'Error fetching branch hours' })
	}
})

module.exports = router
