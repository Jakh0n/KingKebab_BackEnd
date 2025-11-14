const mongoose = require('mongoose')

const scheduleSchema = new mongoose.Schema(
	{
		branch: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Branch',
			required: true,
			index: true,
		},
		worker: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
			index: true,
		},
		date: {
			type: Date,
			required: true,
			index: true,
		},
		startTime: {
			type: String,
			required: true,
			validate: {
				validator: function (v) {
					return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)
				},
				message: 'Start time must be in HH:MM format',
			},
		},
		endTime: {
			type: String,
			required: true,
			validate: {
				validator: function (v) {
					return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v)
				},
				message: 'End time must be in HH:MM format',
			},
		},
		shiftType: {
			type: String,
			enum: ['day', 'night'],
			required: true,
		},
		role: {
			type: String,
			enum: ['worker', 'rider', 'manager', 'cashier', 'cook'],
			required: true,
		},
		status: {
			type: String,
			enum: ['scheduled', 'confirmed', 'completed', 'no-show', 'cancelled'],
			default: 'scheduled',
		},
		notes: {
			type: String,
			default: '',
			maxlength: 500,
		},
		createdBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
			required: true,
		},
		confirmedBy: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User',
		},
		confirmedAt: {
			type: Date,
		},
		// Reference to original schedule if this is part of a recurring series
		originalScheduleId: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Schedule',
		},
	},
	{ timestamps: true }
)

// Compound indexes for efficient queries
scheduleSchema.index({ branch: 1, date: 1 })
scheduleSchema.index({ worker: 1, date: 1 })
scheduleSchema.index({ date: 1, status: 1 })
scheduleSchema.index({ branch: 1, date: 1, shiftType: 1 })

// Virtual for calculating shift duration in hours
scheduleSchema.virtual('duration').get(function () {
	const [startHour, startMinute] = this.startTime.split(':').map(Number)
	const [endHour, endMinute] = this.endTime.split(':').map(Number)

	const startMinutes = startHour * 60 + startMinute
	let endMinutes = endHour * 60 + endMinute

	// Handle overnight shifts
	if (endMinutes < startMinutes) {
		endMinutes += 24 * 60
	}

	return (endMinutes - startMinutes) / 60
})

// Instance method to check for time conflicts
scheduleSchema.methods.hasConflictWith = function (otherSchedule) {
	if (
		this.worker.toString() !== otherSchedule.worker.toString() ||
		this.date.toDateString() !== otherSchedule.date.toDateString()
	) {
		return false
	}

	const [thisStartHour, thisStartMinute] = this.startTime.split(':').map(Number)
	const [thisEndHour, thisEndMinute] = this.endTime.split(':').map(Number)
	const [otherStartHour, otherStartMinute] = otherSchedule.startTime
		.split(':')
		.map(Number)
	const [otherEndHour, otherEndMinute] = otherSchedule.endTime
		.split(':')
		.map(Number)

	const thisStart = thisStartHour * 60 + thisStartMinute
	let thisEnd = thisEndHour * 60 + thisEndMinute
	const otherStart = otherStartHour * 60 + otherStartMinute
	let otherEnd = otherEndHour * 60 + otherEndMinute

	// Handle overnight shifts
	if (thisEnd < thisStart) thisEnd += 24 * 60
	if (otherEnd < otherStart) otherEnd += 24 * 60

	return thisStart < otherEnd && thisEnd > otherStart
}

// Static method to find schedules by date range
scheduleSchema.statics.findByDateRange = function (
	startDate,
	endDate,
	options = {}
) {
	const query = {
		date: {
			$gte: startDate,
			$lte: endDate,
		},
	}

	if (options.branch) {
		query.branch = options.branch
	}

	if (options.worker) {
		query.worker = options.worker
	}

	if (options.status) {
		query.status = options.status
	}

	return this.find(query)
		.populate('worker', 'username name position photoUrl')
		.populate('branch', 'name code location')
		.sort({ date: 1, startTime: 1 })
}

// Static method to find conflicts for a worker on a specific date
scheduleSchema.statics.findConflicts = async function (
	workerId,
	date,
	startTime,
	endTime,
	excludeId
) {
	const query = {
		worker: workerId,
		date: date,
		status: { $nin: ['cancelled'] },
	}

	if (excludeId) {
		query._id = { $ne: excludeId }
	}

	const existingSchedules = await this.find(query)

	return existingSchedules.filter(schedule => {
		const tempSchedule = {
			worker: workerId,
			date: date,
			startTime: startTime,
			endTime: endTime,
		}
		return schedule.hasConflictWith(tempSchedule)
	})
}

// Pre-save middleware to validate no conflicts
scheduleSchema.pre('save', async function (next) {
	try {
		// Skip conflict check if schedule is cancelled
		if (this.status === 'cancelled') {
			return next()
		}

		const conflicts = await this.constructor.findConflicts(
			this.worker,
			this.date,
			this.startTime,
			this.endTime,
			this._id
		)

		if (conflicts.length > 0) {
			const error = new Error(
				`Worker already scheduled at this time. Conflicting schedule: ${conflicts[0].startTime}-${conflicts[0].endTime}`
			)
			error.name = 'ValidationError'
			return next(error)
		}

		next()
	} catch (error) {
		next(error)
	}
})

// TTL index to automatically delete old schedules after 6 months
scheduleSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15552000 }) // 180 days = 15552000 seconds

module.exports = mongoose.model('Schedule', scheduleSchema)
