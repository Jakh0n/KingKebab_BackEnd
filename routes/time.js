const express = require('express')
const TimeEntry = require('../models/TimeEntry')
const { auth, adminAuth } = require('../middleware/auth')
const PDFDocument = require('pdfkit')
// Telegram service removed - notifications handled by frontend
const router = express.Router()

// Months list in English
const months = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
]

// Add time entry
router.post('/', auth, async (req, res) => {
	try {
		const {
			startTime,
			endTime,
			date,
			overtimeReason,
			responsiblePerson,
			latePerson,
			employeeId,
		} = req.body

		// Validate input
		if (!startTime || !endTime || !date) {
			return res.status(400).json({ message: 'All fields are required' })
		}

		// Create time entry
		const timeEntry = new TimeEntry({
			user: req.user._id,
			startTime,
			endTime,
			date,
			position: req.user.position,
			employeeId: employeeId || req.user.employeeId,
			overtimeReason: overtimeReason || null,
			responsiblePerson: responsiblePerson || '',
			latePerson: latePerson || '',
		})

		await timeEntry.save()

		// Populate user info
		await timeEntry.populate('user', 'username position employeeId')

		// Telegram notifications are handled by frontend

		res.status(201).json(timeEntry)
	} catch (error) {
		console.error('Error adding time entry:', error)
		res.status(500).json({ message: 'Error adding time entry' })
	}
})

// Get user's time entries
router.get('/my-entries', auth, async (req, res) => {
	try {
		const timeEntries = await TimeEntry.find({ user: req.user._id })
			.populate({
				path: 'user',
				select: '_id username position',
				model: 'User',
			})
			.sort({ date: -1 })
		res.json(timeEntries)
	} catch (error) {
		console.error('Error fetching time entries:', error)
		res.status(500).json({ message: 'Error loading time entries' })
	}
})

// Get all time entries (admin only)
router.get('/all', adminAuth, async (req, res) => {
	try {
		const timeEntries = await TimeEntry.find()
			.populate({
				path: 'user',
				select: '_id username position employeeId',
			})
			.sort({ date: -1 })

		res.json(timeEntries)
	} catch (error) {
		console.error('Error in /all route:', error)
		res.status(500).json({ message: 'Error fetching time entries' })
	}
})

// Get worker's time entries PDF
router.get('/worker-pdf/:userId/:month/:year', auth, async (req, res) => {
	try {
		const { userId, month, year } = req.params

		const timeEntries = await TimeEntry.find({
			user: userId,
			$expr: {
				$and: [
					{ $eq: [{ $month: '$date' }, parseInt(month)] },
					{ $eq: [{ $year: '$date' }, parseInt(year)] },
				],
			},
		})
			.populate('user', 'username position')
			.sort({ date: 1 })

		if (!timeEntries.length) {
			return res.status(404).json({ message: 'No entries found' })
		}

		// Total statistics
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		// Create PDF document
		const doc = new PDFDocument({
			size: 'A4',
			margin: 50,
			info: {
				Title: `Time Report - ${months[parseInt(month) - 1]} ${year}`,
				Author: 'King Kebab',
			},
		})

		// Set response headers
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader(
			'Content-Disposition',
			`attachment; filename=time-report-${
				months[parseInt(month) - 1]
			}-${year}.pdf`
		)

		// Pipe the PDF to the response
		doc.pipe(res)

		// Add header
		doc.fontSize(24).text('King Kebab', { align: 'center' }).moveDown(0.5)

		doc
			.fontSize(18)
			.text(`Time Report - ${months[parseInt(month) - 1]} ${year}`, {
				align: 'center',
			})
			.moveDown(0.5)

		doc
			.fontSize(14)
			.text(
				`${timeEntries[0].user.username} - ${
					timeEntries[0].user.position === 'worker' ? 'Worker' : 'Rider'
				}`,
				{ align: 'center' }
			)
			.moveDown(1)

		// Add summary box
		const boxTop = doc.y
		doc
			.rect(50, boxTop, 495, 100)
			.fillAndStroke('#f6f6f6', '#e0e0e0')
			.moveDown(0.5)

		// Summary information
		doc.fill('#333333').fontSize(12)

		// First row
		doc.text('Position:', 70, boxTop + 20)
		doc.text(
			timeEntries[0].user.position === 'worker' ? 'Worker' : 'Rider',
			200,
			boxTop + 20
		)

		doc.text('Total Days:', 300, boxTop + 20)
		doc.text(`${timeEntries.length} days`, 430, boxTop + 20)

		// Second row
		doc.text('Regular Days:', 70, boxTop + 45)
		doc.text(`${regularDays} days`, 200, boxTop + 45)

		doc.text('Overtime Days:', 300, boxTop + 45)
		doc.text(`${overtimeDays} days`, 430, boxTop + 45)

		// Third row
		doc.text('Total Hours:', 70, boxTop + 70)
		doc.text(`${totalHours.toFixed(1)} hours`, 200, boxTop + 70)

		doc.text('Average Hours:', 300, boxTop + 70)
		doc.text(
			`${(totalHours / timeEntries.length).toFixed(1)} hours`,
			430,
			boxTop + 70
		)

		// Move down after the box
		doc.moveDown(2)

		// Add entries table
		doc.fontSize(16).text('Daily Report:', { underline: true }).moveDown(1)

		// Table headers
		const tableTop = doc.y
		doc
			.fontSize(12)
			.rect(50, tableTop, 495, 30)
			.fillAndStroke('#4a90e2', '#2171c7')

		doc
			.fill('#ffffff')
			.text('Date', 70, tableTop + 10)
			.text('Time', 200, tableTop + 10)
			.text('Hours', 350, tableTop + 10)
			.text('Status', 430, tableTop + 10)

		// Table rows
		let rowTop = tableTop + 30
		timeEntries.forEach((entry, index) => {
			const isEven = index % 2 === 0
			const date = new Date(entry.date).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			})
			const startTime = new Date(entry.startTime).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: true,
			})
			const endTime = new Date(entry.endTime).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: true,
			})

			// Add new page if needed
			if (rowTop > doc.page.height - 100) {
				doc.addPage()
				rowTop = 50
			}

			// Row background
			doc
				.rect(50, rowTop, 495, 50)
				.fillAndStroke(isEven ? '#f8f9fa' : '#ffffff')
				.fill('#333333')

			// Row content
			doc.text(date, 70, rowTop + 10)
			doc.text(`${startTime} - ${endTime}`, 200, rowTop + 10)
			doc.text(`${entry.hours} hours`, 350, rowTop + 10)
			doc.text(entry.hours > 12 ? 'Overtime' : 'Regular', 430, rowTop + 10)

			// Add overtime reason if exists
			if (entry.hours > 12 && entry.overtimeReason) {
				doc
					.fontSize(10)
					.fill('#f0ad4e')
					.text(`Reason: ${entry.overtimeReason}`, 70, rowTop + 30)

				if (
					entry.overtimeReason === 'Company Request' &&
					entry.responsiblePerson
				) {
					doc
						.fill('#5bc0de')
						.text(`Responsible: ${entry.responsiblePerson}`, 350, rowTop + 30)
				}

				if (entry.overtimeReason === 'Late Arrival' && entry.latePerson) {
					doc
						.fill('#5bc0de')
						.text(`Late Person: ${entry.latePerson}`, 350, rowTop + 30)
				}
			}

			rowTop += 50
		})

		// Finalize the PDF
		doc.end()
	} catch (error) {
		console.error('Error generating PDF:', error)
		res.status(500).json({ message: 'Error generating PDF' })
	}
})

// Get my time entries PDF
router.get('/my-pdf/:month/:year', auth, async (req, res) => {
	try {
		const { month, year } = req.params
		const userId = req.user._id

		const timeEntries = await TimeEntry.find({
			user: userId,
			$expr: {
				$and: [
					{ $eq: [{ $month: '$date' }, parseInt(month)] },
					{ $eq: [{ $year: '$date' }, parseInt(year)] },
				],
			},
		})
			.populate('user', 'username position')
			.sort({ date: 1 })

		if (!timeEntries.length) {
			return res.status(404).json({ message: 'No entries found' })
		}

		// Total statistics
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		// Create PDF document
		const doc = new PDFDocument({
			size: 'A4',
			margin: 50,
			info: {
				Title: `Time Report - ${months[parseInt(month) - 1]} ${year}`,
				Author: 'King Kebab',
			},
		})

		// Set response headers
		res.setHeader('Content-Type', 'application/pdf')
		res.setHeader(
			'Content-Disposition',
			`attachment; filename=${timeEntries[0].user.username}-${
				months[parseInt(month) - 1]
			}-${year}.pdf`
		)

		// Pipe the PDF to the response
		doc.pipe(res)

		// Add header
		doc.fontSize(24).text('King Kebab', { align: 'center' }).moveDown(0.5)

		doc
			.fontSize(18)
			.text(`Time Report - ${months[parseInt(month) - 1]} ${year}`, {
				align: 'center',
			})
			.moveDown(0.5)

		doc
			.fontSize(14)
			.text(
				`${timeEntries[0].user.username} - ${
					timeEntries[0].user.position === 'worker' ? 'Worker' : 'Rider'
				}`,
				{ align: 'center' }
			)
			.moveDown(1)

		// Add summary box
		const boxTop = doc.y
		doc
			.rect(50, boxTop, 495, 100)
			.fillAndStroke('#f6f6f6', '#e0e0e0')
			.moveDown(0.5)

		// Summary information
		doc.fill('#333333').fontSize(12)

		// First row
		doc.text('Position:', 70, boxTop + 20)
		doc.text(
			timeEntries[0].user.position === 'worker' ? 'Worker' : 'Rider',
			200,
			boxTop + 20
		)

		doc.text('Total Days:', 300, boxTop + 20)
		doc.text(`${timeEntries.length} days`, 430, boxTop + 20)

		// Second row
		doc.text('Regular Days:', 70, boxTop + 45)
		doc.text(`${regularDays} days`, 200, boxTop + 45)

		doc.text('Overtime Days:', 300, boxTop + 45)
		doc.text(`${overtimeDays} days`, 430, boxTop + 45)

		// Third row
		doc.text('Total Hours:', 70, boxTop + 70)
		doc.text(`${totalHours.toFixed(1)} hours`, 200, boxTop + 70)

		doc.text('Average Hours:', 300, boxTop + 70)
		doc.text(
			`${(totalHours / timeEntries.length).toFixed(1)} hours`,
			430,
			boxTop + 70
		)

		// Move down after the box
		doc.moveDown(2)

		// Add entries table
		doc.fontSize(16).text('Daily Report:', { underline: true }).moveDown(1)

		// Table headers
		const tableTop = doc.y
		doc
			.fontSize(12)
			.rect(50, tableTop, 495, 30)
			.fillAndStroke('#4a90e2', '#2171c7')

		doc
			.fill('#ffffff')
			.text('Date', 70, tableTop + 10)
			.text('Time', 200, tableTop + 10)
			.text('Hours', 350, tableTop + 10)
			.text('Status', 430, tableTop + 10)

		// Table rows
		let rowTop = tableTop + 30
		timeEntries.forEach((entry, index) => {
			const isEven = index % 2 === 0
			const date = new Date(entry.date).toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			})
			const startTime = new Date(entry.startTime).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: true,
			})
			const endTime = new Date(entry.endTime).toLocaleTimeString('en-US', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: true,
			})

			// Add new page if needed
			if (rowTop > doc.page.height - 100) {
				doc.addPage()
				rowTop = 50
			}

			// Row background
			doc
				.rect(50, rowTop, 495, 50)
				.fillAndStroke(isEven ? '#f8f9fa' : '#ffffff')
				.fill('#333333')

			// Row content
			doc.text(date, 70, rowTop + 10)
			doc.text(`${startTime} - ${endTime}`, 200, rowTop + 10)
			doc.text(`${entry.hours} hours`, 350, rowTop + 10)
			doc.text(entry.hours > 12 ? 'Overtime' : 'Regular', 430, rowTop + 10)

			// Add overtime reason if exists
			if (entry.hours > 12 && entry.overtimeReason) {
				doc
					.fontSize(10)
					.fill('#f0ad4e')
					.text(`Reason: ${entry.overtimeReason}`, 70, rowTop + 30)

				if (
					entry.overtimeReason === 'Company Request' &&
					entry.responsiblePerson
				) {
					doc
						.fill('#5bc0de')
						.text(`Responsible: ${entry.responsiblePerson}`, 350, rowTop + 30)
				}

				if (entry.overtimeReason === 'Late Arrival' && entry.latePerson) {
					doc
						.fill('#5bc0de')
						.text(`Late Person: ${entry.latePerson}`, 350, rowTop + 30)
				}
			}

			rowTop += 50
		})

		// Finalize the PDF
		doc.end()
	} catch (error) {
		console.error('Error generating PDF:', error)
		res.status(500).json({ message: 'Error generating PDF' })
	}
})

// Vaqtlarni olish (kunlik)
router.get('/daily/:date', auth, async (req, res) => {
	try {
		const requestedDate = new Date(req.params.date)
		const startOfDay = new Date(requestedDate.setHours(0, 0, 0, 0))
		const endOfDay = new Date(requestedDate.setHours(23, 59, 59, 999))

		const entries = await TimeEntry.find({
			user: req.user._id,
			date: {
				$gte: startOfDay,
				$lte: endOfDay,
			},
		}).populate('user', '_id username position')

		res.json(entries)
	} catch (error) {
		res.status(500).json({ message: 'Error fetching time entries' })
	}
})

// Vaqtlarni olish (haftalik)
router.get('/weekly/:startDate', auth, async (req, res) => {
	try {
		const startDate = new Date(req.params.startDate)
		const endDate = new Date(startDate)
		endDate.setDate(endDate.getDate() + 7)

		const entries = await TimeEntry.find({
			user: req.user._id,
			date: {
				$gte: startDate,
				$lt: endDate,
			},
		}).populate('user', '_id username position')

		res.json(entries)
	} catch (error) {
		res.status(500).json({ message: 'Error fetching time entries' })
	}
})

// Vaqt yozuvini o'chirish
router.delete('/:id', auth, async (req, res) => {
	try {
		const timeEntry = await TimeEntry.findOne({
			_id: req.params.id,
			user: req.user._id,
		})

		if (!timeEntry) {
			return res.status(404).json({ message: 'Time entry not found' })
		}

		await timeEntry.deleteOne()
		res.json({ message: 'Time entry deleted' })
	} catch (error) {
		console.error('Error:', error)
		res.status(500).json({ message: 'Server error' })
	}
})

// Vaqt yozuvini yangilash
router.put('/:id', auth, async (req, res) => {
	try {
		const {
			startTime,
			endTime,
			date,
			overtimeReason,
			responsiblePerson,
			latePerson,
		} = req.body

		// Validate input
		if (!startTime || !endTime || !date) {
			return res.status(400).json({ message: 'All fields are required' })
		}

		const timeEntry = await TimeEntry.findById(req.params.id)
		if (!timeEntry) {
			return res.status(404).json({ message: 'Time entry not found' })
		}

		// Check ownership
		if (timeEntry.user.toString() !== req.user._id.toString()) {
			return res.status(403).json({ message: 'Not authorized' })
		}

		// Update fields
		timeEntry.startTime = startTime
		timeEntry.endTime = endTime
		timeEntry.date = date
		timeEntry.overtimeReason = overtimeReason || null
		timeEntry.responsiblePerson = responsiblePerson || ''
		timeEntry.latePerson = latePerson || ''

		await timeEntry.save()

		// Populate user info
		await timeEntry.populate('user', 'username position employeeId')

		// Telegram notifications are handled by frontend

		res.json(timeEntry)
	} catch (error) {
		console.error('Error updating time entry:', error)
		res.status(500).json({ message: 'Error updating time entry' })
	}
})

module.exports = router
