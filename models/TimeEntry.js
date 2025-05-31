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
	const diffMs = end - start
	const diffHrs = diffMs / (1000 * 60 * 60)
	const breakHrs = this.breakMinutes / 60
	this.hours = Number((diffHrs - breakHrs).toFixed(1))
	next()
})

module.exports = mongoose.model('TimeEntry', timeEntrySchema)
