import { Router, Request, Response } from 'express'
import { supabase } from '../config/supabase'
import { requireAuth } from '../middleware/requireAuth'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password, name } = req.body as { email?: string; password?: string; name?: string }

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    user_metadata: { name },
    email_confirm: true,
  })

  if (error) {
    res.status(400).json({ error: error.message })
    return
  }

  res.status(201).json({ data: { id: data.user.id, email: data.user.email } })
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string }

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    res.status(401).json({ error: error.message })
    return
  }

  res.json({ data: { access_token: data.session.access_token, user: data.user } })
})

// GET /api/auth/ebay-oauth-url
router.get('/ebay-oauth-url', requireAuth, (_req: Request, res: Response): void => {
  const clientId = process.env.EBAY_OAUTH_CLIENT_ID
  const redirectUri = process.env.EBAY_OAUTH_REDIRECT_URI
  const scopes = [
    'https://api.ebay.com/oauth/api_scope',
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.marketing',
    'https://api.ebay.com/oauth/api_scope/sell.account',
  ].join('%20')

  const url =
    `https://auth.ebay.com/oauth2/authorize?` +
    `client_id=${clientId}&` +
    `redirect_uri=${encodeURIComponent(redirectUri ?? '')}&` +
    `response_type=code&` +
    `scope=${scopes}`

  res.json({ data: { url } })
})

// POST /api/auth/ebay-callback
router.post('/ebay-callback', requireAuth, (_req: Request, res: Response): void => {
  // TODO: Exchange code for eBay user token, store in ebay_accounts table
  res.status(501).json({ error: 'Not implemented' })
})

// POST /api/auth/logout
router.post('/logout', requireAuth, async (_req: Request, res: Response): Promise<void> => {
  res.json({ data: { message: 'Logged out' } })
})

export default router
