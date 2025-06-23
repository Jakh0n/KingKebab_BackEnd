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
app.use('/api/announcements', require('./routes/announcements'))
app.use('/api/profile', require('./routes/profile'))

// MongoDB connection
mongoose
	.connect(process.env.MONGODB_URI)
	.then(() => console.log('MongoDB connection successful'))
	.catch(err => console.error('MongoDB connection error:', err))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`))
