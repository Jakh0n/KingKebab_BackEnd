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
		employeeId: {
			type: String,
			required: false,
		},
		overtimeReason: {
			type: String,
			enum: {
				values: ['Busy', 'Last Order', 'Company Request', 'Late Arrival'],
				message: 'Invalid overtime reason',
			},
			default: null,
		},
		responsiblePerson: {
			type: String,
			enum: {
				values: ['Adilcan', 'Boss'],
				message: 'Invalid responsible person',
			},
			default: undefined,
		},
		latePerson: {
			type: String,
			default: '',
		},
	},
	{ timestamps: true }
)

// 3 oydan eski ma'lumotlarni o'chirish uchun TTL indeksi
timeEntrySchema.index({ date: 1 }, { expireAfterSeconds: 7776000 }) // 90 kun = 7776000 sekund

// Automatically calculate hours
// Mongoose 9 removed the `next` callback in middleware — hooks must be sync or async.
timeEntrySchema.pre('save', function () {
	const start = new Date(this.startTime)
	const end = new Date(this.endTime)

	const startHour = start.getHours()
	const endHour = end.getHours()
	const startMinutes = start.getMinutes()
	const endMinutes = end.getMinutes()

	let workHours
	if (
		endHour < startHour ||
		(endHour === startHour && endMinutes < startMinutes)
	) {
		workHours = 24 - startHour + endHour
		workHours = workHours + (endMinutes - startMinutes) / 60
	} else {
		workHours = endHour - startHour + (endMinutes - startMinutes) / 60
	}

	this.hours = Number(workHours.toFixed(1))
})

const TimeEntry = mongoose.model('TimeEntry', timeEntrySchema)

module.exports = TimeEntry
