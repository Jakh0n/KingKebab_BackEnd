const mongoose = require('mongoose')

const timeEntrySchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		date: {
			type: Date,
			required: true,
			index: true,
		},
		startTime: {
			type: Date,
			required: true,
		},
		endTime: {
			type: Date,
			required: true,
		},
		hours: {
			type: Number,
			required: true,
			default: 0,
		},
		position: {
			type: String,
			required: true,
			default: 'worker',
		},
		overtimeReason: {
			type: String,
			enum: ['Busy', 'Last Order', 'Company Request', null],
			default: null,
		},
		responsiblePerson: {
			type: String,
			enum: ['Adilcan', 'Boss', ''],
			default: '',
		},
	},
	{ timestamps: true }
)

// 3 oydan eski ma'lumotlarni o'chirish uchun TTL indeksi
timeEntrySchema.index({ date: 1 }, { expireAfterSeconds: 7776000 }) // 90 kun = 7776000 sekund

// Hours ni avtomatik hisoblash
timeEntrySchema.pre('save', function (next) {
	const start = new Date(this.startTime)
	const end = new Date(this.endTime)

	// Soatlarni olish
	const startHour = start.getHours()
	const endHour = end.getHours()
	const startMinutes = start.getMinutes()
	const endMinutes = end.getMinutes()

	let workHours
	if (
		endHour < startHour ||
		(endHour === startHour && endMinutes < startMinutes)
	) {
		// Agar tugash vaqti kichik bo'lsa (masalan 21:00 - 09:00)
		workHours = 24 - startHour + endHour
		workHours = workHours + (endMinutes - startMinutes) / 60
	} else {
		// Oddiy holat (masalan 09:00 - 17:00)
		workHours = endHour - startHour + (endMinutes - startMinutes) / 60
	}

	this.hours = Number(workHours.toFixed(1))
	next()
})

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema)

module.exports = TimeEntry
