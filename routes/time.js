const express = require('express')
const TimeEntry = require('../models/TimeEntry')
const { auth, adminAuth } = require('../middleware/auth')
const PDFDocument = require('pdfkit')
const router = express.Router()

// Oylar ro'yxati
const months = [
	'Yanvar',
	'Fevral',
	'Mart',
	'April',
	'May',
	'Iyun',
	'Iyul',
	'Avgust',
	'Sentabr',
	'Oktabr',
	'Noyabr',
	'Dekabr',
]

// Add time entry
router.post('/', auth, async (req, res) => {
	try {
		const { startTime, endTime, date, description, breakMinutes } = req.body

		console.log('Received data:', {
			startTime,
			endTime,
			date,
			description,
			breakMinutes,
		})

		const timeEntry = new TimeEntry({
			user: req.user.userId,
			startTime: new Date(startTime),
			endTime: new Date(endTime),
			date: new Date(date),
			description,
			breakMinutes: parseInt(breakMinutes) || 0,
			position: req.user.position,
		})

		console.log('TimeEntry before save:', timeEntry)

		await timeEntry.save()

		// Populate user ma'lumotlari bilan qaytarish
		const savedEntry = await timeEntry.populate('user', '_id username position')

		console.log('Saved entry:', savedEntry)

		res.status(201).json(savedEntry)
	} catch (error) {
		console.error('Error creating time entry:', error)
		res.status(500).json({ message: "Vaqt qo'shishda xatolik yuz berdi" })
	}
})

// Get user's time entries
router.get('/my-entries', auth, async (req, res) => {
	try {
		const timeEntries = await TimeEntry.find({ user: req.user.userId })
			.populate({
				path: 'user',
				select: '_id username position',
				model: 'User',
			})
			.sort({ date: -1 })
		res.json(timeEntries)
	} catch (error) {
		console.error('Error fetching time entries:', error)
		res.status(500).json({ message: 'Vaqtlarni yuklashda xatolik' })
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

// Get worker's time entries PDF (admin only)
router.get('/worker-pdf/:userId/:month/:year', adminAuth, async (req, res) => {
	try {
		const { userId, month, year } = req.params

		// Ishchi ma'lumotlarini olish
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

		// PDF yaratish
		const doc = new PDFDocument({
			size: 'A4',
			margin: 50,
			bufferPages: true,
		})

		// Create a buffer to store the PDF
		let buffers = []
		doc.on('data', buffers.push.bind(buffers))
		doc.on('end', () => {
			let pdfData = Buffer.concat(buffers)
			res.writeHead(200, {
				'Content-Length': Buffer.byteLength(pdfData),
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${
					timeEntries[0].user.username
				}-${months[parseInt(month) - 1]}-${year}.pdf"`,
			})
			res.end(pdfData)
		})

		// PDF dizayni
		doc.font('Helvetica-Bold')
		doc.fontSize(16)
		doc.text(`${timeEntries[0].user.username} - Vaqt hisoboti`, {
			align: 'center',
		})
		doc.moveDown()

		doc.fontSize(12)
		doc.text(
			`Lavozim: ${
				timeEntries[0].user.position === 'worker' ? 'Ishchi' : 'Rider'
			}`
		)
		doc.text(`Oy: ${month}`)
		doc.text(`Yil: ${year}`)
		doc.moveDown()

		// Jami statistika
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		doc.text(`Jami ishlagan soat: ${totalHours.toFixed(1)} soat`)
		doc.text(`Oddiy kunlar: ${regularDays} kun`)
		doc.text(`Qo'shimcha kunlar: ${overtimeDays} kun`)
		doc.moveDown()

		// Kunlik ma'lumotlar
		doc.font('Helvetica-Bold')
		doc.text('Kunlik hisobot:', { underline: true })
		doc.moveDown()

		timeEntries.forEach(entry => {
			doc.font('Helvetica')
			const date = new Date(entry.date).toLocaleDateString('uz-UZ')
			const startTime = new Date(entry.startTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})
			const endTime = new Date(entry.endTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})

			doc.text(`Sana: ${date}`)
			doc.text(`Vaqt: ${startTime} - ${endTime}`)
			doc.text(`Ishlagan soat: ${entry.hours} soat`)
			doc.text(`Tanaffus: ${entry.breakMinutes} daqiqa`)
			doc.text(`Izoh: ${entry.description}`)
			doc.moveDown()
		})

		doc.end()
	} catch (error) {
		console.error('Error generating PDF:', error)
		res.status(500).json({
			message: 'Error generating PDF',
			error: error.message,
		})
	}
})

// Get my time entries PDF
router.get('/my-pdf/:month/:year', auth, async (req, res) => {
	try {
		const { month, year } = req.params
		const userId = req.user.userId

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

		// PDF yaratish
		const doc = new PDFDocument({
			size: 'A4',
			margin: 50,
			bufferPages: true,
		})

		// Create a buffer to store the PDF
		let buffers = []
		doc.on('data', buffers.push.bind(buffers))
		doc.on('end', () => {
			let pdfData = Buffer.concat(buffers)
			res.writeHead(200, {
				'Content-Length': Buffer.byteLength(pdfData),
				'Content-Type': 'application/pdf',
				'Content-Disposition': `attachment; filename="${
					timeEntries[0].user.username
				}-${months[parseInt(month) - 1]}-${year}.pdf"`,
			})
			res.end(pdfData)
		})

		// PDF dizayni
		doc.font('Helvetica-Bold')
		doc.fontSize(16)
		doc.text(`${timeEntries[0].user.username} - Vaqt hisoboti`, {
			align: 'center',
		})
		doc.moveDown()

		doc.fontSize(12)
		doc.text(
			`Lavozim: ${
				timeEntries[0].user.position === 'worker' ? 'Ishchi' : 'Rider'
			}`
		)
		doc.text(`Oy: ${months[parseInt(month) - 1]}`)
		doc.text(`Yil: ${year}`)
		doc.moveDown()

		// Jami statistika
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		doc.text(`Jami ishlagan soat: ${totalHours.toFixed(1)} soat`)
		doc.text(`Oddiy kunlar: ${regularDays} kun`)
		doc.text(`Qo'shimcha kunlar: ${overtimeDays} kun`)
		doc.moveDown()

		// Kunlik ma'lumotlar
		doc.font('Helvetica-Bold')
		doc.text('Kunlik hisobot:', { underline: true })
		doc.moveDown()

		timeEntries.forEach(entry => {
			doc.font('Helvetica')
			const date = new Date(entry.date).toLocaleDateString('uz-UZ')
			const startTime = new Date(entry.startTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})
			const endTime = new Date(entry.endTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})

			doc.text(`Sana: ${date}`)
			doc.text(`Vaqt: ${startTime} - ${endTime}`)
			doc.text(`Ishlagan soat: ${entry.hours} soat`)
			doc.text(`Tanaffus: ${entry.breakMinutes} daqiqa`)
			doc.text(`Izoh: ${entry.description}`)
			doc.moveDown()
		})

		doc.end()
	} catch (error) {
		console.error('Error generating PDF:', error)
		res.status(500).json({
			message: 'Error generating PDF',
			error: error.message,
		})
	}
})

module.exports = router
