import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import profileRoutes from './routes/Profile'
import authRoutes from './routes/auth'
import bookingRoutes from './routes/booking'
import cookieParser from 'cookie-parser'

dotenv.config()

const app = express()

// Configure CORS to allow credentials from frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json())
app.use(cookieParser())

app.use('/profile', profileRoutes)
app.use('/auth', authRoutes)
app.use('/booking', bookingRoutes)

if (process.env.NODE_ENV !== 'test') {
    app.listen(3000, () => {
        console.log(`Server is running on port 3000`)
    })
}

export default app
