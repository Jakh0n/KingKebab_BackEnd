const express = require('express')
const TimeEntry = require('../models/TimeEntry')
const { auth, adminAuth } = require('../middleware/auth')
const pdf = require('html-pdf')
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

		// Jami statistika
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		// Create HTML content
		let htmlContent = `
			<html>
				<head>
					<style>
						body { font-family: Arial, sans-serif; padding: 20px; }
						.header { text-align: center; margin-bottom: 20px; }
						.info { margin-bottom: 20px; }
						.entry { margin-bottom: 15px; padding: 10px; border-bottom: 1px solid #eee; }
						.total { margin-top: 20px; font-weight: bold; }
					</style>
				</head>
				<body>
					<div class="header">
						<h1>${timeEntries[0].user.username} - Vaqt hisoboti</h1>
					</div>
					<div class="info">
						<p>Lavozim: ${
							timeEntries[0].user.position === 'worker' ? 'Ishchi' : 'Rider'
						}</p>
						<p>Oy: ${months[parseInt(month) - 1]}</p>
						<p>Yil: ${year}</p>
					</div>
					<div class="total">
						<p>Jami ishlagan soat: ${totalHours.toFixed(1)} soat</p>
						<p>Oddiy kunlar: ${regularDays} kun</p>
						<p>Qo'shimcha kunlar: ${overtimeDays} kun</p>
					</div>
					<h2>Kunlik hisobot:</h2>
				`

		timeEntries.forEach(entry => {
			const date = new Date(entry.date).toLocaleDateString('uz-UZ')
			const startTime = new Date(entry.startTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})
			const endTime = new Date(entry.endTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})

			htmlContent += `
				<div class="entry">
					<p>Sana: ${date}</p>
					<p>Vaqt: ${startTime} - ${endTime}</p>
					<p>Ishlagan soat: ${entry.hours} soat</p>
					<p>Tanaffus: ${entry.breakMinutes} daqiqa</p>
					${entry.description ? `<p>Izoh: ${entry.description}</p>` : ''}
				</div>
			`
		})

		htmlContent += `
				</body>
			</html>
		`

		// PDF options
		const options = {
			format: 'A4',
			border: {
				top: '20px',
				right: '20px',
				bottom: '20px',
				left: '20px',
			},
		}

		// Generate PDF
		pdf.create(htmlContent, options).toBuffer((err, buffer) => {
			if (err) {
				console.error('Error creating PDF:', err)
				return res.status(500).json({
					message: 'Error generating PDF',
					error: err.message,
				})
			}

			res.setHeader('Content-Type', 'application/pdf')
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${timeEntries[0].user.username}-${
					months[parseInt(month) - 1]
				}-${year}.pdf"`
			)
			res.send(buffer)
		})
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

		// Jami statistika
		const totalHours = timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
		const regularDays = timeEntries.filter(entry => entry.hours <= 12).length
		const overtimeDays = timeEntries.filter(entry => entry.hours > 12).length

		// Create HTML content
		let htmlContent = `
			<html>
				<head>
					<style>
						body { font-family: Arial, sans-serif; padding: 20px; }
						.header { text-align: center; margin-bottom: 20px; }
						.info { margin-bottom: 20px; }
						.entry { margin-bottom: 15px; padding: 10px; border-bottom: 1px solid #eee; }
						.total { margin-top: 20px; font-weight: bold; }
					</style>
				</head>
				<body>
					<div class="header">
						<h1>${timeEntries[0].user.username} - Vaqt hisoboti</h1>
					</div>
					<div class="info">
						<p>Lavozim: ${
							timeEntries[0].user.position === 'worker' ? 'Ishchi' : 'Rider'
						}</p>
						<p>Oy: ${months[parseInt(month) - 1]}</p>
						<p>Yil: ${year}</p>
					</div>
					<div class="total">
						<p>Jami ishlagan soat: ${totalHours.toFixed(1)} soat</p>
						<p>Oddiy kunlar: ${regularDays} kun</p>
						<p>Qo'shimcha kunlar: ${overtimeDays} kun</p>
					</div>
					<h2>Kunlik hisobot:</h2>
				`

		timeEntries.forEach(entry => {
			const date = new Date(entry.date).toLocaleDateString('uz-UZ')
			const startTime = new Date(entry.startTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})
			const endTime = new Date(entry.endTime).toLocaleTimeString('uz-UZ', {
				hour: '2-digit',
				minute: '2-digit',
			})

			htmlContent += `
				<div class="entry">
					<p>Sana: ${date}</p>
					<p>Vaqt: ${startTime} - ${endTime}</p>
					<p>Ishlagan soat: ${entry.hours} soat</p>
					<p>Tanaffus: ${entry.breakMinutes} daqiqa</p>
					${entry.description ? `<p>Izoh: ${entry.description}</p>` : ''}
				</div>
			`
		})

		htmlContent += `
				</body>
			</html>
		`

		// PDF options
		const options = {
			format: 'A4',
			border: {
				top: '20px',
				right: '20px',
				bottom: '20px',
				left: '20px',
			},
		}

		// Generate PDF
		pdf.create(htmlContent, options).toBuffer((err, buffer) => {
			if (err) {
				console.error('Error creating PDF:', err)
				return res.status(500).json({
					message: 'Error generating PDF',
					error: err.message,
				})
			}

			res.setHeader('Content-Type', 'application/pdf')
			res.setHeader(
				'Content-Disposition',
				`attachment; filename="${timeEntries[0].user.username}-${
					months[parseInt(month) - 1]
				}-${year}.pdf"`
			)
			res.send(buffer)
		})
	} catch (error) {
		console.error('Error generating PDF:', error)
		res.status(500).json({
			message: 'Error generating PDF',
			error: error.message,
		})
	}
})

module.exports = router
