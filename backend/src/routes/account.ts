import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { supabase } from '../config/supabase'

const router = Router()

router.use(requireAuth)

// GET /api/account
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, plan, created_at')
    .eq('id', req.userId)
    .single()

  if (error) {
    res.status(404).json({ error: 'User not found' })
    return
  }

  res.json({ data })
})

// PUT /api/account
router.put('/', async (req: Request, res: Response): Promise<void> => {
  const { name } = req.body as { name?: string }

  const { data, error } = await supabase
    .from('users')
    .update({ name })
    .eq('id', req.userId)
    .select('id, email, name, plan, created_at')
    .single()

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.json({ data })
})

// GET /api/account/usage
router.get('/usage', async (req: Request, res: Response): Promise<void> => {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count, error } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', req.userId)
    .gte('created_at', startOfMonth.toISOString())

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data: { listings_this_month: count ?? 0 } })
})

// GET /api/account/ebay-status
router.get('/ebay-status', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('ebay_accounts')
    .select('ebay_user_id, site_id, created_at, refreshed_at')
    .eq('user_id', req.userId)
    .single()

  if (error) {
    res.json({ data: { linked: false } })
    return
  }

  res.json({ data: { linked: true, ...data } })
})

export default router
