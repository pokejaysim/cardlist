import express from 'express'
import cors from 'cors'
import 'dotenv/config'

import authRoutes from './routes/auth'
import listingsRoutes from './routes/listings'
import pricingRoutes from './routes/pricing'
import accountRoutes from './routes/account'
import { errorHandler } from './middleware/errorHandler'

const app = express()

app.use(cors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:5173' }))
app.use(express.json())

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/listings', listingsRoutes)
app.use('/api/pricing', pricingRoutes)
app.use('/api/account', accountRoutes)

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.use(errorHandler)

export default app
