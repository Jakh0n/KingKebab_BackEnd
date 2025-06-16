const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

const app = express()

// CORS configuration
app.use(
	cors({
		origin: [process.env.FRONTEND_URL, 'http://localhost:3000'],
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	})
)

// Middleware
app.use(express.json())
app.use(helmet())
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }))

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/time', require('./routes/time'))
app.use('/api/users', require('./routes/users'))

// MongoDB connection options
const mongooseOptions = {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverSelectionTimeoutMS: 30000,
	socketTimeoutMS: 60000,
	connectTimeoutMS: 30000,
	retryWrites: true,
	retryReads: true,
	maxPoolSize: 50,
	minPoolSize: 5,
	keepAlive: true,
	keepAliveInitialDelay: 300000,
}

// MongoDB connection with retry logic and better error handling
const connectWithRetry = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
		console.log('MongoDB ulanish muvaffaqiyatli')

		mongoose.connection.on('connected', () => {
			console.log('MongoDB connected')
		})
		mongoose.connection.on('error', err => {
			console.error('MongoDB connection error:', err)
			setTimeout(connectWithRetry, 5000)
		})
		mongoose.connection.on('disconnected', () => {
			console.log('MongoDB disconnected. Attempting to reconnect...')
			connectWithRetry()
		})
		mongoose.connection.on('reconnected', () => {
			console.log('MongoDB reconnected successfully')
		})
	} catch (err) {
		console.error('MongoDB ulanish xatosi:', err)
		console.log("5 sekunddan keyin qayta urinib ko'ramiz...")
		setTimeout(connectWithRetry, 5000)
	}
}

// Initial connection
connectWithRetry()

// Global error handler
app.use((err, req, res, next) => {
	console.error('Global error:', err)
	res.status(500).json({
		message: 'Serverda kutilmagan xatolik',
		error: process.env.NODE_ENV === 'development' ? err.message : undefined,
	})
})

// Graceful shutdown
process.on('SIGINT', async () => {
	try {
		await mongoose.connection.close()
		console.log('MongoDB connection closed through app termination')
		process.exit(0)
	} catch (err) {
		console.error('Error during MongoDB connection closure:', err)
		process.exit(1)
	}
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server ${PORT} portda ishlamoqda`))
