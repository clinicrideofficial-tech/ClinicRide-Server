import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import patientRoutes from './routes/Profile'
import authRoutes from './routes/auth'
import bookingRoutes from './routes/booking'
import cookieParser from 'cookie-parser'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())
app.use(cookieParser())

app.use('/patient', patientRoutes)
app.use('/auth', authRoutes)
app.use('/booking', bookingRoutes)

app.listen(3000, () => {
    console.log(`Server is running on port 3000`)
})
