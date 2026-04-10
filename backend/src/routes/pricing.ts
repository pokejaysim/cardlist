import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

router.use(requireAuth)

// POST /api/pricing/suggest
router.post('/suggest', async (_req: Request, res: Response): Promise<void> => {
  // TODO: Query PriceCharting API + eBay findCompletedItems, average results
  res.status(501).json({ error: 'Not implemented' })
})

export default router
