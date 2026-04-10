import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { supabase } from '../config/supabase'
import { CreateListingBody, UpdateListingBody } from '../types'

const router = Router()

// All listing routes require auth
router.use(requireAuth)

// POST /api/listings — Create draft
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as CreateListingBody

  if (!body.card_name) {
    res.status(400).json({ error: 'card_name is required' })
    return
  }

  const { data, error } = await supabase
    .from('listings')
    .insert({
      user_id: req.userId,
      card_name: body.card_name,
      set_name: body.set_name,
      card_number: body.card_number,
      rarity: body.rarity,
      language: body.language ?? 'English',
      condition: body.condition,
      listing_type: body.listing_type ?? 'auction',
      duration: body.duration ?? 7,
      status: 'draft',
    })
    .select()
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json({ data })
})

// GET /api/listings — List all
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('user_id', req.userId)
    .order('created_at', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})

// GET /api/listings/:id
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', req.params['id'])
    .eq('user_id', req.userId)
    .single()

  if (error) {
    res.status(404).json({ error: 'Listing not found' })
    return
  }

  res.json({ data })
})

// PUT /api/listings/:id
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as UpdateListingBody

  const { data, error } = await supabase
    .from('listings')
    .update(body)
    .eq('id', req.params['id'])
    .eq('user_id', req.userId)
    .eq('status', 'draft')
    .select()
    .single()

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.json({ data })
})

// POST /api/listings/:id/publish — Send to eBay
router.post('/:id/publish', async (_req: Request, res: Response): Promise<void> => {
  // TODO: Enqueue Bull job to call eBay AddItem
  res.status(501).json({ error: 'Not implemented' })
})

// DELETE /api/listings/:id
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', req.params['id'])
    .eq('user_id', req.userId)
    .eq('status', 'draft')

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(204).send()
})

export default router
