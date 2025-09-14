const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
const dotenv = require('dotenv')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const path = require('path')
const authRoutes = require('./routes/auth')
const timeRoutes = require('./routes/time')
const profileRoutes = require('./routes/profile')
const telegramRoutes = require('./routes/telegram')

dotenv.config()

const app = express()

// Security middleware
app.use(helmet())
app.use(express.json())

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// CORS configuration
app.use(
	cors({
		origin: [process.env.FRONTEND_URL, 'http://localhost:3000'],
		credentials: true,
		methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
		allowedHeaders: ['Content-Type', 'Authorization'],
		exposedHeaders: ['Content-Range', 'X-Content-Range'],
	})
)

// Rate limiting
const limiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 daqiqa
	max: 100, // har bir IP dan 100 ta so'rov
})
app.use(limiter)

// MongoDB connection with retry logic
const connectWithRetry = () => {
	mongoose
		.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
		})
		.then(() => {
			console.log('MongoDB connected successfully')
		})
		.catch(err => {
			console.error('MongoDB connection error:', err)
			console.log('Retrying in 5 seconds...')
			setTimeout(connectWithRetry, 5000)
		})
}

connectWithRetry()

// Error handling middleware
app.use((err, req, res, next) => {
	console.error(err.stack)
	res.status(500).json({ message: 'Something went wrong!' })
})

app.use('/api/auth', authRoutes)
app.use('/api/time', timeRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/telegram', telegramRoutes)
app.use('/api/notify', require('./routes/notify'))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
})
