const express = require('express')
const TimeEntry = require('../models/TimeEntry')
const { auth, adminAuth } = require('../middleware/auth')
const PDFDocument = require('pdfkit')
const ExcelJS = require('exceljs')
const { sendTelegramNotification } = require('../utils/telegram')
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
		const { startTime, endTime, date, overtimeReason, responsiblePerson } =
			req.body

		// Validate input
		if (!startTime || !endTime || !date) {
			return res.status(400).json({ message: 'All fields are required' })
		}

		// Validate user
		if (!req.user || !req.user._id) {
			return res.status(401).json({ message: 'User not authenticated' })
		}

		// Validate date format
		const startDate = new Date(startTime)
		const endDate = new Date(endTime)
		const entryDate = new Date(date)

		if (
			isNaN(startDate.getTime()) ||
			isNaN(endDate.getTime()) ||
			isNaN(entryDate.getTime())
		) {
			return res.status(400).json({ message: 'Invalid date format' })
		}

		// Check for overlapping entries
		const existingEntry = await TimeEntry.findOne({
			user: req.user._id,
			date: entryDate,
			$or: [
				{
					startTime: { $lt: endDate },
					endTime: { $gt: startDate },
				},
			],
		})

		if (existingEntry) {
			return res
				.status(400)
				.json({ message: 'Time entry overlaps with existing entry' })
		}

		// Create time entry
		const timeEntry = new TimeEntry({
			user: req.user._id,
			startTime: startDate,
			endTime: endDate,
			date: entryDate,
			position: req.user.position,
			overtimeReason: overtimeReason || null,
			responsiblePerson: responsiblePerson || '',
		})

		await timeEntry.save()

		// Populate user info
		await timeEntry.populate('user', 'username position')

		// Send Telegram notification
		const message = `
🆕 <b>Yangi vaqt qo'shildi</b>

👤 Foydalanuvchi: ${timeEntry.user.username}
📅 Sana: ${new Date(timeEntry.date).toLocaleDateString()}
⏰ Vaqt: ${new Date(timeEntry.startTime).toLocaleTimeString()} - ${new Date(
			timeEntry.endTime
		).toLocaleTimeString()}
⏱️ Soatlar: ${timeEntry.hours}
${
	timeEntry.overtimeReason
		? `\n⚠️ Qo'shimcha ish sababi: ${timeEntry.overtimeReason}`
		: ''
}
${
	timeEntry.responsiblePerson
		? `\n👥 Mas'ul shaxs: ${timeEntry.responsiblePerson}`
		: ''
}
		`.trim()

		await sendTelegramNotification(message)

		res.status(201).json(timeEntry)
	} catch (error) {
		console.error('Error adding time entry:', error)
		res.status(500).json({
			message: 'Error adding time entry',
			error: error.message,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		})
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
			.lean()

		// Format dates for frontend
		const formattedEntries = timeEntries.map(entry => ({
			...entry,
			startTime: new Date(entry.startTime).toISOString(),
			endTime: new Date(entry.endTime).toISOString(),
			date: new Date(entry.date).toISOString(),
		}))

		res.json(formattedEntries)
	} catch (error) {
		console.error('Error fetching time entries:', error)
		res.status(500).json({
			message: 'Vaqtlarni yuklashda xatolik',
			error: error.message,
			stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
		})
	}
})

// Get all time entries (admin only)
router.get('/all', adminAuth, async (req, res) => {
	try {
		const timeEntries = await TimeEntry.find()
			.populate({
				path: 'user',
				select: '_id username position',
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
		res.status(500).json({ message: 'Vaqtlarni olishda xatolik' })
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
		res.status(500).json({ message: 'Vaqtlarni olishda xatolik' })
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
			return res.status(404).json({ message: 'Vaqt yozuvi topilmadi' })
		}

		await timeEntry.deleteOne()
		res.json({ message: "Vaqt yozuvi o'chirildi" })
	} catch (error) {
		console.error('Error:', error)
		res.status(500).json({ message: 'Server xatosi' })
	}
})

// Vaqt yozuvini yangilash
router.put('/:id', auth, async (req, res) => {
	try {
		const { startTime, endTime, date, overtimeReason, responsiblePerson } =
			req.body

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

		await timeEntry.save()

		// Populate user info
		await timeEntry.populate('user', 'username position')

		res.json(timeEntry)
	} catch (error) {
		console.error('Error updating time entry:', error)
		res.status(500).json({ message: 'Error updating time entry' })
	}
})

// Get worker's time entries Excel
router.get('/worker-excel/:userId/:month/:year', auth, async (req, res) => {
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
			.populate('user', 'username position employeeId')
			.sort({ date: 1 })

		if (!timeEntries.length) {
			return res.status(404).json({ message: 'No entries found' })
		}

		// Create a new workbook and worksheet
		const workbook = new ExcelJS.Workbook()
		const worksheet = workbook.addWorksheet('Time Report')

		// Add headers
		worksheet.columns = [
			{ header: 'Employee ID', key: 'employeeId', width: 15 },
			{ header: 'Username', key: 'username', width: 20 },
			{ header: 'Total Hours', key: 'totalHours', width: 15 },
			{ header: 'Total Days', key: 'totalDays', width: 15 },
			{ header: 'Regular Days', key: 'regularDays', width: 15 },
			{ header: 'Overtime Days', key: 'overtimeDays', width: 15 },
		]

		// Calculate statistics
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		// Add data row
		worksheet.addRow({
			employeeId: timeEntries[0].user.employeeId,
			username: timeEntries[0].user.username,
			totalHours: totalHours.toFixed(1),
			totalDays: timeEntries.length,
			regularDays: regularDays,
			overtimeDays: overtimeDays,
		})

		// Style the header row
		worksheet.getRow(1).font = { bold: true }
		worksheet.getRow(1).fill = {
			type: 'pattern',
			pattern: 'solid',
			fgColor: { argb: '4E7BEE' },
		}
		worksheet.getRow(1).font = { color: { argb: 'FFFFFF' } }

		// Set response headers
		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		)
		res.setHeader(
			'Content-Disposition',
			`attachment; filename=time-report-${
				months[parseInt(month) - 1]
			}-${year}.xlsx`
		)

		// Write to response
		await workbook.xlsx.write(res)
		res.end()
	} catch (error) {
		console.error('Error generating Excel:', error)
		res.status(500).json({ message: 'Error generating Excel' })
	}
})

// Get all workers time entries Excel (modern sheetjs version)
router.get('/all-workers-excel/:month/:year', auth, async (req, res) => {
	try {
		const { month, year } = req.params
		const XLSX = require('xlsx')

		// Get all time entries for the selected month and year
		const timeEntries = await TimeEntry.find({
			$expr: {
				$and: [
					{ $eq: [{ $month: '$date' }, parseInt(month)] },
					{ $eq: [{ $year: '$date' }, parseInt(year)] },
				],
			},
		})
			.populate('user', 'username position employeeId')
			.sort({ date: 1 })

		if (!timeEntries.length) {
			return res.status(404).json({ message: 'No entries found' })
		}

		// Group entries by user
		const userStats = timeEntries.reduce((acc, entry) => {
			const userId = entry.user._id.toString()
			if (!acc[userId]) {
				acc[userId] = {
					employeeId: entry.user.employeeId || '',
					username: entry.user.username,
					position: entry.user.position === 'worker' ? 'Worker' : 'Rider',
					totalHours: 0,
					totalDays: 0,
					regularDays: 0,
					overtimeDays: 0,
				}
			}
			acc[userId].totalHours += entry.hours
			acc[userId].totalDays++
			if (entry.hours <= 12) {
				acc[userId].regularDays++
			} else {
				acc[userId].overtimeDays++
			}
			return acc
		}, {})

		// Prepare data for sheetjs
		const data = Object.values(userStats).map(stats => ({
			...stats,
			totalHours: stats.totalHours.toFixed(1),
		}))

		// Create worksheet and workbook
		const worksheet = XLSX.utils.json_to_sheet(data)
		const workbook = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(workbook, worksheet, 'All Workers Report')

		// Write workbook to buffer
		const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

		res.setHeader(
			'Content-Type',
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		)
		res.setHeader(
			'Content-Disposition',
			`attachment; filename=all-workers-report-${month}-${year}.xlsx`
		)
		res.send(buffer)
	} catch (error) {
		console.error('Error generating Excel:', error)
		res.status(500).json({ message: 'Error generating Excel' })
	}
})

module.exports = router
