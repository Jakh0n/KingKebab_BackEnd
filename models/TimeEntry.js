const mongoose = require('mongoose')

const timeEntrySchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
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
		date: {
			type: Date,
			required: true,
		},
		description: {
			type: String,
			required: true,
		},
		position: {
			type: String,
			required: true,
			default: 'worker',
		},
		breakMinutes: {
			type: Number,
			default: 0,
		},
	},
	{ timestamps: true }
)

// Hours ni avtomatik hisoblash
timeEntrySchema.pre('save', function (next) {
	const start = new Date(this.startTime)
	const end = new Date(this.endTime)

	// Soatlarni olish
	const startHour = start.getHours()
	const endHour = end.getHours()

	let workHours
	if (endHour < startHour) {
		// Agar tugash vaqti kichik bo'lsa (masalan 21:00 - 09:00)
		workHours = 24 - startHour + endHour
	} else {
		// Oddiy holat (masalan 09:00 - 17:00)
		workHours = endHour - startHour
	}

	// Minutlarni qo'shish
	const startMinutes = start.getMinutes()
	const endMinutes = end.getMinutes()
	const minutesDiff = (endMinutes - startMinutes) / 60

	workHours = workHours + minutesDiff

	// Tanaffusni ayirish
	const breakHrs = this.breakMinutes / 60
	this.hours = Number((workHours - breakHrs).toFixed(1))

	next()
})

module.exports = mongoose.model('TimeEntry', timeEntrySchema)
