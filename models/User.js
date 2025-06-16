const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema(
	{
		username: {
			type: String,
			required: [true, 'Username is required'],
			unique: true,
			trim: true,
			minlength: [3, 'Username must be at least 3 characters long'],
		},
		password: {
			type: String,
			required: [true, 'Password is required'],
			minlength: [6, 'Password must be at least 6 characters long'],
		},
		position: {
			type: String,
			enum: ['worker', 'rider'],
			required: [true, 'Position is required'],
		},
		isAdmin: {
			type: Boolean,
			default: false,
		},
		employeeId: {
			type: String,
			required: [true, 'Employee ID is required'],
			unique: true,
			trim: true,
			validate: {
				validator: function (v) {
					return /^[A-Za-z0-9-]+$/.test(v)
				},
				message: 'Employee ID can only contain letters, numbers, and hyphens',
			},
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
		toObject: { virtuals: true },
	}
)

// Indexes for better query performance
userSchema.index({ username: 1 })
userSchema.index({ employeeId: 1 })
userSchema.index({ position: 1 })

userSchema.pre('save', async function (next) {
	if (!this.isModified('password')) return next()
	this.password = await bcrypt.hash(this.password, 10)
	next()
})

userSchema.methods.comparePassword = async function (candidatePassword) {
	return await bcrypt.compare(candidatePassword, this.password)
}

module.exports = mongoose.model('User', userSchema)
