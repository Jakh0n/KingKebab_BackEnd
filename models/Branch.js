const mongoose = require('mongoose')

const branchSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: true,
			unique: true,
			trim: true,
			maxlength: 100,
		},
		code: {
			type: String,
			required: true,
			unique: true,
			uppercase: true,
			minlength: 2,
			maxlength: 10,
		},
		location: {
			address: {
				type: String,
				required: true,
				trim: true,
			},
			city: {
				type: String,
				required: true,
				trim: true,
			},
			district: {
				type: String,
				default: '',
				trim: true,
			},
			coordinates: {
				latitude: {
					type: Number,
					min: -90,
					max: 90,
				},
				longitude: {
					type: Number,
					min: -180,
					max: 180,
				},
			},
		},
		contact: {
			phone: {
				type: String,
				default: '',
			},
			email: {
				type: String,
				default: '',
			},
			manager: {
				type: String,
				default: '',
			},
		},
		operatingHours: {
			monday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
			tuesday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
			wednesday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
			thursday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
			friday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
			saturday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
			sunday: {
				isOpen: { type: Boolean, default: true },
				open: { type: String, default: '08:00' },
				close: { type: String, default: '22:00' },
			},
		},
		capacity: {
			maxWorkers: {
				type: Number,
				required: true,
				min: 1,
				max: 20,
				default: 5,
			},
			maxRiders: {
				type: Number,
				default: 2,
				min: 0,
				max: 10,
			},
		},
		requirements: {
			minimumStaff: {
				type: Number,
				default: 2,
				min: 1,
			},
			skillsRequired: [
				{
					type: String,
					enum: ['cooking', 'cashier', 'cleaning', 'management', 'delivery'],
				},
			],
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		notes: {
			type: String,
			default: '',
			maxlength: 1000,
		},
	},
	{ timestamps: true }
)

// Compound index for efficient queries
branchSchema.index({ isActive: 1, name: 1 })

// Instance method to check if branch is open on a specific day
branchSchema.methods.isOpenOnDay = function (day) {
	const dayLower = day.toLowerCase()
	return this.operatingHours[dayLower] && this.operatingHours[dayLower].isOpen
}

// Instance method to get operating hours for a specific day
branchSchema.methods.getHoursForDay = function (day) {
	const dayLower = day.toLowerCase()
	if (this.operatingHours[dayLower] && this.operatingHours[dayLower].isOpen) {
		return {
			open: this.operatingHours[dayLower].open,
			close: this.operatingHours[dayLower].close,
		}
	}
	return null
}

// Static method to find active branches
branchSchema.statics.findActive = function () {
	return this.find({ isActive: true }).sort({ name: 1 })
}

module.exports = mongoose.model('Branch', branchSchema)
