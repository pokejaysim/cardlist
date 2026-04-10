export interface ApiError {
  error: string
  code?: string
}

export interface ApiResponse<T> {
  data?: T
  error?: string
  code?: string
}

// Auth
export interface AuthUser {
  id: string
  email: string
  name?: string
}

// Listings
export type ListingStatus = 'draft' | 'scheduled' | 'published' | 'error'
export type ListingType = 'auction' | 'fixed_price'
export type CardCondition = 'NM' | 'LP' | 'MP' | 'HP' | 'DMG'
export type CardLanguage = 'English' | 'Japanese' | 'French' | 'German' | 'Spanish' | 'Korean' | 'Portuguese' | 'Chinese'

export interface Listing {
  id: string
  user_id: string
  ebay_item_id?: number
  status: ListingStatus

  // Card Details
  card_name: string
  set_name?: string
  card_number?: string
  rarity?: string
  language: CardLanguage
  condition?: CardCondition

  // Listing Details
  title?: string
  description?: string
  price_cad?: number
  listing_type: ListingType
  duration: number

  // Photos
  photo_urls?: string[]

  // Metadata
  created_at: string
  published_at?: string
  ebay_error?: string
  research_notes?: string
}

export interface CreateListingBody {
  card_name: string
  set_name?: string
  card_number?: string
  rarity?: string
  language?: CardLanguage
  condition?: CardCondition
  listing_type?: ListingType
  duration?: number
}

export interface UpdateListingBody extends Partial<CreateListingBody> {
  title?: string
  description?: string
  price_cad?: number
  photo_urls?: string[]
}
