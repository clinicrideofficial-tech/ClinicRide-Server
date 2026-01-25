import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import profileRoutes from './routes/Profile'
import authRoutes from './routes/auth'
import bookingRoutes from './routes/booking'
import addressRoutes from './routes/address'
import cookieParser from 'cookie-parser'
import { setupWebSocketServer } from './lib/websocket'

const app = express()
const httpServer = createServer(app)

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
app.use('/address', addressRoutes)

// Initialize WebSocket server
setupWebSocketServer(httpServer)

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
    httpServer.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`)
        console.log(`WebSocket server running on ws://localhost:${PORT}/ws`)
    })
}

export default app
