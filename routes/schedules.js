const express = require('express')
const router = express.Router()
const Schedule = require('../models/Schedule')
const Branch = require('../models/Branch')
const User = require('../models/User')
const { adminAuth, auth } = require('../middleware/auth')

// Get schedules by date range (admin and workers can view)
router.get('/', auth, async (req, res) => {
	try {
		const {
			startDate,
			endDate,
			branchId,
			workerId,
			status,
			shiftType,
			page = 1,
			limit = 50,
		} = req.query

		// Default to current week if no dates provided
		const today = new Date()
		const defaultStart = new Date(
			today.setDate(today.getDate() - today.getDay())
		)
		const defaultEnd = new Date(defaultStart)
		defaultEnd.setDate(defaultStart.getDate() + 6)

		const start = startDate ? new Date(startDate) : defaultStart
		const end = endDate ? new Date(endDate) : defaultEnd

		// If not admin, workers can only see their own schedules
		let query = {
			date: { $gte: start, $lte: end },
		}

		if (!req.user.isAdmin) {
			query.worker = req.user.userId
		} else {
			// Admin can filter by specific worker or branch
			if (workerId) query.worker = workerId
			if (branchId) query.branch = branchId
		}

		if (status) query.status = status
		if (shiftType) query.shiftType = shiftType

		const skip = (page - 1) * limit
		const schedules = await Schedule.find(query)
			.populate('worker', 'username name position photoUrl employeeId')
			.populate('branch', 'name code location')
			.populate('createdBy', 'username name')
			.sort({ date: 1, startTime: 1 })
			.skip(skip)
			.limit(parseInt(limit))

		const total = await Schedule.countDocuments(query)

		res.json({
			schedules,
			pagination: {
				page: parseInt(page),
				limit: parseInt(limit),
				total,
				pages: Math.ceil(total / limit),
			},
		})
	} catch (error) {
		console.error('Get schedules error:', error)
		res.status(500).json({ message: 'Error fetching schedules' })
	}
})

// Get schedule by ID
router.get('/:id', auth, async (req, res) => {
	try {
		const schedule = await Schedule.findById(req.params.id)
			.populate('worker', 'username name position photoUrl employeeId')
			.populate('branch', 'name code location')
			.populate('createdBy', 'username name')
			.populate('confirmedBy', 'username name')

		if (!schedule) {
			return res.status(404).json({ message: 'Schedule not found' })
		}

		// Non-admin users can only view their own schedules
		if (
			!req.user.isAdmin &&
			schedule.worker._id.toString() !== req.user.userId
		) {
			return res.status(403).json({ message: 'Access denied' })
		}

		res.json(schedule)
	} catch (error) {
		console.error('Get schedule error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid schedule ID' })
		}
		res.status(500).json({ message: 'Error fetching schedule' })
	}
})

// Create new schedule (admin only)
router.post('/', adminAuth, async (req, res) => {
	try {
		const {
			branchId,
			workerId,
			startTime,
			endTime,
			shiftType,
			role,
			notes,
			duration,
			workingDays,
		} = req.body

		// Validate required fields
		if (
			!branchId ||
			!workerId ||
			!startTime ||
			!endTime ||
			!shiftType ||
			!role ||
			!duration ||
			!workingDays ||
			workingDays.length === 0
		) {
			return res.status(400).json({
				message:
					'Branch, worker, start time, end time, shift type, role, duration, and working days are required',
			})
		}

		// Verify branch exists and is active
		const branch = await Branch.findById(branchId)
		if (!branch || !branch.isActive) {
			return res.status(400).json({ message: 'Branch not found or inactive' })
		}

		// Verify worker exists and is active
		const worker = await User.findById(workerId)
		if (!worker || !worker.isActive) {
			return res.status(400).json({ message: 'Worker not found or inactive' })
		}

		// Validate time format and logic
		const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
		if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
			return res.status(400).json({ message: 'Invalid time format. Use HH:MM' })
		}

		// Create schedules for the next 4 weeks (28 days) for the selected working days
		const createdSchedules = []
		const today = new Date()
		today.setHours(0, 0, 0, 0)

		// Day name mapping
		const dayNames = [
			'sunday',
			'monday',
			'tuesday',
			'wednesday',
			'thursday',
			'friday',
			'saturday',
		]

		console.log(
			`Creating schedules for working days: ${workingDays.join(', ')}`
		)

		// Create schedules for the next 28 days (4 weeks)
		for (let i = 0; i < 28; i++) {
			const currentDate = new Date(today)
			currentDate.setDate(today.getDate() + i)
			const dayOfWeek = dayNames[currentDate.getDay()]

			// Only create schedule if this day is in the working days list
			if (workingDays.includes(dayOfWeek)) {
				const scheduleData = {
					branch: branchId,
					worker: workerId,
					date: new Date(currentDate),
					startTime,
					endTime,
					shiftType,
					role,
					notes: notes || '',
					createdBy: req.user.userId,
				}

				try {
					const schedule = new Schedule(scheduleData)
					await schedule.save()
					createdSchedules.push(schedule)
					console.log(
						`Created schedule for ${dayOfWeek} ${
							currentDate.toISOString().split('T')[0]
						}`
					)
				} catch (error) {
					console.error('Error creating schedule for date:', currentDate, error)
				}
			}
		}

		// Use the first created schedule for the response
		const schedule = createdSchedules[0]

		await schedule.populate([
			{ path: 'worker', select: 'username name position photoUrl' },
			{ path: 'branch', select: 'name code location' },
			{ path: 'createdBy', select: 'username name' },
		])

		const durationText = duration === '1year' ? '1 year' : '6 months'
		const workingDaysText = workingDays
			.map(day => day.charAt(0).toUpperCase() + day.slice(1))
			.join(', ')
		res.status(201).json({
			message: `Schedule created successfully for ${durationText} - Worker will appear on ${workingDaysText} for ${createdSchedules.length} days`,
			schedule,
			createdCount: createdSchedules.length,
		})
	} catch (error) {
		console.error('Create schedule error:', error)
		if (error.name === 'ValidationError') {
			return res.status(400).json({
				message: 'Validation error',
				details: error.message,
			})
		}
		res.status(500).json({ message: 'Error creating schedule' })
	}
})

// Update schedule (admin only)
router.put('/:id', adminAuth, async (req, res) => {
	try {
		const {
			branchId,
			workerId,
			startTime,
			endTime,
			shiftType,
			role,
			status,
			notes,
		} = req.body

		const schedule = await Schedule.findById(req.params.id)
		if (!schedule) {
			return res.status(404).json({ message: 'Schedule not found' })
		}

		// Validate branch if provided
		if (branchId && branchId !== schedule.branch.toString()) {
			const branch = await Branch.findById(branchId)
			if (!branch || !branch.isActive) {
				return res.status(400).json({ message: 'Branch not found or inactive' })
			}
			schedule.branch = branchId
		}

		// Validate worker if provided
		if (workerId && workerId !== schedule.worker.toString()) {
			const worker = await User.findById(workerId)
			if (!worker || !worker.isActive) {
				return res.status(400).json({ message: 'Worker not found or inactive' })
			}
			schedule.worker = workerId
		}

		// Update other fields
		if (startTime) {
			const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
			if (!timeRegex.test(startTime)) {
				return res
					.status(400)
					.json({ message: 'Invalid start time format. Use HH:MM' })
			}
			schedule.startTime = startTime
		}
		if (endTime) {
			const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
			if (!timeRegex.test(endTime)) {
				return res
					.status(400)
					.json({ message: 'Invalid end time format. Use HH:MM' })
			}
			schedule.endTime = endTime
		}
		if (shiftType) schedule.shiftType = shiftType
		if (role) schedule.role = role
		if (status) schedule.status = status
		if (notes !== undefined) schedule.notes = notes

		await schedule.save()

		await schedule.populate([
			{ path: 'worker', select: 'username name position photoUrl' },
			{ path: 'branch', select: 'name code location' },
			{ path: 'createdBy', select: 'username name' },
		])

		res.json({
			message: 'Schedule updated successfully',
			schedule,
		})
	} catch (error) {
		console.error('Update schedule error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid schedule ID' })
		}
		if (error.name === 'ValidationError') {
			return res.status(400).json({
				message: 'Validation error',
				details: error.message,
			})
		}
		res.status(500).json({ message: 'Error updating schedule' })
	}
})

// Delete schedule (admin only)
router.delete('/:id', adminAuth, async (req, res) => {
	try {
		const schedule = await Schedule.findById(req.params.id)
		if (!schedule) {
			return res.status(404).json({ message: 'Schedule not found' })
		}

		await Schedule.findByIdAndDelete(req.params.id)

		res.json({
			message: 'Schedule deleted successfully',
		})
	} catch (error) {
		console.error('Delete schedule error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid schedule ID' })
		}
		res.status(500).json({ message: 'Error deleting schedule' })
	}
})

// Confirm schedule (worker can confirm their own, admin can confirm any)
router.patch('/:id/confirm', auth, async (req, res) => {
	try {
		const schedule = await Schedule.findById(req.params.id)
		if (!schedule) {
			return res.status(404).json({ message: 'Schedule not found' })
		}

		// Check if user can confirm this schedule
		if (!req.user.isAdmin && schedule.worker.toString() !== req.user.userId) {
			return res
				.status(403)
				.json({ message: 'You can only confirm your own schedules' })
		}

		schedule.status = 'confirmed'
		schedule.confirmedBy = req.user.userId
		schedule.confirmedAt = new Date()

		await schedule.save()

		await schedule.populate([
			{ path: 'worker', select: 'username name position photoUrl' },
			{ path: 'branch', select: 'name code location' },
			{ path: 'confirmedBy', select: 'username name' },
		])

		res.json({
			message: 'Schedule confirmed successfully',
			schedule,
		})
	} catch (error) {
		console.error('Confirm schedule error:', error)
		if (error.name === 'CastError') {
			return res.status(400).json({ message: 'Invalid schedule ID' })
		}
		res.status(500).json({ message: 'Error confirming schedule' })
	}
})

// Get conflicts for a specific worker and date range (admin only)
router.get('/conflicts/check', adminAuth, async (req, res) => {
	try {
		const { workerId, startDate, endDate, startTime, endTime } = req.query

		if (!workerId || !startDate || !startTime || !endTime) {
			return res.status(400).json({
				message: 'Worker ID, start date, start time, and end time are required',
			})
		}

		const date = new Date(startDate)
		const conflicts = await Schedule.findConflicts(
			workerId,
			date,
			startTime,
			endTime
		)

		res.json({
			hasConflicts: conflicts.length > 0,
			conflicts: conflicts.map(conflict => ({
				id: conflict._id,
				date: conflict.date,
				startTime: conflict.startTime,
				endTime: conflict.endTime,
				branch: conflict.branch,
				shiftType: conflict.shiftType,
			})),
		})
	} catch (error) {
		console.error('Check conflicts error:', error)
		res.status(500).json({ message: 'Error checking conflicts' })
	}
})

// Get weekly schedule overview (admin only)
router.get('/weekly/:year/:week', adminAuth, async (req, res) => {
	try {
		const { year, week } = req.params
		const { branchId, shiftType } = req.query

		// Calculate week start and end dates
		const startDate = getDateFromWeek(parseInt(year), parseInt(week))
		const endDate = new Date(startDate)
		endDate.setDate(startDate.getDate() + 6)

		console.log(`Weekly query: Week ${week}, Year ${year}`)
		console.log(
			`Date range: ${startDate.toISOString().split('T')[0]} to ${
				endDate.toISOString().split('T')[0]
			}`
		)

		let query = {
			date: { $gte: startDate, $lte: endDate },
		}

		if (branchId) {
			query.branch = branchId
		}

		if (shiftType) {
			query.shiftType = shiftType
		}

		// Get schedules for the date range
		const schedules = await Schedule.find(query)
			.populate('worker', 'username name position photoUrl employeeId')
			.populate('branch', 'name code')
			.sort({ date: 1, startTime: 1 })

		console.log(
			`Found ${schedules.length} schedules for week ${week}, year ${year}`
		)
		console.log('Date range:', startDate, 'to', endDate)
		console.log('Query:', query)

		// Group schedules by date and branch
		const weeklyData = {}

		for (let i = 0; i < 7; i++) {
			const currentDate = new Date(startDate)
			currentDate.setDate(startDate.getDate() + i)
			const dateStr = currentDate.toISOString().split('T')[0]
			weeklyData[dateStr] = {}
		}

		schedules.forEach(schedule => {
			const dateStr = schedule.date.toISOString().split('T')[0]
			const branchCode = schedule.branch.code

			if (!weeklyData[dateStr][branchCode]) {
				weeklyData[dateStr][branchCode] = []
			}

			weeklyData[dateStr][branchCode].push(schedule)
			console.log(
				`Added schedule for ${dateStr} at branch ${branchCode} - Worker: ${schedule.worker.name}`
			)
		})

		res.json({
			year: parseInt(year),
			week: parseInt(week),
			startDate,
			endDate,
			schedules: weeklyData,
		})
	} catch (error) {
		console.error('Get weekly schedule error:', error)
		res.status(500).json({ message: 'Error fetching weekly schedule' })
	}
})

// Helper function to create recurring schedules
async function createRecurringSchedules(originalSchedule, endDate) {
	const createdSchedules = []
	const pattern = originalSchedule.recurringPattern
	let currentDate = new Date(originalSchedule.date)

	while (currentDate <= endDate) {
		// Move to next occurrence based on pattern
		switch (pattern) {
			case 'daily':
				currentDate.setDate(currentDate.getDate() + 1)
				break
			case 'weekly':
				currentDate.setDate(currentDate.getDate() + 7)
				break
			case 'monthly':
				currentDate.setMonth(currentDate.getMonth() + 1)
				break
			default:
				return createdSchedules
		}

		if (currentDate <= endDate) {
			try {
				const newSchedule = new Schedule({
					branch: originalSchedule.branch,
					worker: originalSchedule.worker,
					date: new Date(currentDate),
					startTime: originalSchedule.startTime,
					endTime: originalSchedule.endTime,
					shiftType: originalSchedule.shiftType,
					role: originalSchedule.role,
					notes: originalSchedule.notes,
					createdBy: originalSchedule.createdBy,
					isRecurring: true,
					recurringPattern: pattern,
					originalScheduleId: originalSchedule._id,
				})

				await newSchedule.save()
				createdSchedules.push(newSchedule)
			} catch (error) {
				console.error('Error creating recurring schedule:', error)
				// Continue with other schedules even if one fails
			}
		}
	}

	return createdSchedules
}

// Helper function to get date from year and week number
function getDateFromWeek(year, week) {
	const firstDayOfYear = new Date(year, 0, 1)
	const daysToAdd = (week - 1) * 7
	const targetDate = new Date(
		firstDayOfYear.getTime() + daysToAdd * 24 * 60 * 60 * 1000
	)

	// Adjust to Monday of that week
	const dayOfWeek = targetDate.getDay()
	const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
	targetDate.setDate(targetDate.getDate() + mondayOffset)

	return targetDate
}

module.exports = router
