const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
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

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/time', require('./routes/time'))
app.use('/api/users', require('./routes/users'))

// MongoDB connection options
const mongooseOptions = {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	serverSelectionTimeoutMS: 5000,
	socketTimeoutMS: 45000,
	connectTimeoutMS: 10000,
	retryWrites: true,
	retryReads: true,
}

// MongoDB connection with retry logic
const connectWithRetry = async () => {
	try {
		await mongoose.connect(process.env.MONGODB_URI, mongooseOptions)
		console.log('MongoDB ulanish muvaffaqiyatli')
	} catch (err) {
		console.error('MongoDB ulanish xatosi:', err)
		console.log("5 sekunddan keyin qayta urinib ko'ramiz...")
		setTimeout(connectWithRetry, 5000)
	}
}

// Initial connection
connectWithRetry()

// Handle MongoDB connection events
mongoose.connection.on('error', err => {
	console.error('MongoDB connection error:', err)
})

mongoose.connection.on('disconnected', () => {
	console.log('MongoDB disconnected. Attempting to reconnect...')
	connectWithRetry()
})

mongoose.connection.on('reconnected', () => {
	console.log('MongoDB reconnected successfully')
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server ${PORT} portda ishlamoqda`))
