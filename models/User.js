const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const userSchema = new mongoose.Schema(
	{
		username: {
			type: String,
			required: true,
			unique: true,
		},
		name: {
			type: String,
			default: '',
		},
		email: {
			type: String,
			default: '',
		},
		phone: {
			type: String,
			default: '',
		},
		bio: {
			type: String,
			default: '',
			maxlength: 500,
		},
		password: {
			type: String,
			required: true,
		},
		employeeId: {
			type: String,
			required: true,
			unique: true,
		},
		position: {
			type: String,
			required: true,
			enum: ['worker', 'rider'],
		},
		department: {
			type: String,
			default: '',
		},
		salary: {
			type: Number,
			default: 0,
		},
		hireDate: {
			type: Date,
			default: Date.now,
		},
		photoUrl: {
			type: String,
			default: '',
		},
		isAdmin: {
			type: Boolean,
			default: false,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		lastLogin: {
			type: Date,
			default: Date.now,
		},
		skills: [
			{
				type: String,
			},
		],
		emergencyContact: {
			name: {
				type: String,
				default: '',
			},
			phone: {
				type: String,
				default: '',
			},
			relationship: {
				type: String,
				default: '',
			},
		},
	},
	{ timestamps: true }
)

userSchema.methods.comparePassword = async function (candidatePassword) {
	return await bcrypt.compare(candidatePassword, this.password)
}

module.exports = mongoose.model('User', userSchema)
