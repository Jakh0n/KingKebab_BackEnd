const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')
require('dotenv').config()

const app = express()

// CORS sozlamalari
app.use(
	cors({
		origin: process.env.FRONTEND_URL
			? [process.env.FRONTEND_URL, 'http://localhost:3000']
			: ['http://localhost:3000'],
		credentials: true,
	})
)

// Middleware
app.use(express.json())

// Routes
app.use('/api/auth', require('./routes/auth'))
app.use('/api/time', require('./routes/time'))
app.use('/api/users', require('./routes/users'))

// MongoDB ulanish
mongoose
	.connect(process.env.MONGODB_URI)
	.then(() => console.log('MongoDB ulanish muvaffaqiyatli'))
	.catch(err => console.error('MongoDB ulanish xatosi:', err))

const PORT = process.env.PORT || 5000
app.listen(PORT, () => console.log(`Server ${PORT} portda ishlamoqda`))
