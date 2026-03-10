import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const businessId = searchParams.get('business_id')

    let query = supabase
      .from('services')
      .select('id, name, duration_minutes, price')
      .eq('active', true)

    if (businessId) query = query.eq('business_id', businessId)

    const { data, error } = await query.order('name')
    if (error) throw error

    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}