import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import userRoutes from './routes/user'
import authRoutes from './routes/auth'
import cookieParser from 'cookie-parser'

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())
app.use(cookieParser())

app.use('/user', userRoutes)
app.use('/auth', authRoutes)

app.listen(3000, () => {
    console.log(`Server is running on port 3000`)
})
