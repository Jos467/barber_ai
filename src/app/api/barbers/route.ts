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
      .from('barbers')
      .select('id, name, active')
      .eq('active', true)

    if (businessId) query = query.eq('business_id', businessId)

    const { data: barbers, error } = await query.order('name')
    if (error) throw error

    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
    const end   = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()

    const { data: todayApts } = await supabase
      .from('appointments')
      .select('barber_id')
      .gte('scheduled_at', start)
      .lte('scheduled_at', end)
      .in('status', ['confirmed', 'pending'])

    const busyIds = new Set((todayApts || []).map((a: any) => a.barber_id))

    const result = (barbers || []).map((b: any) => ({
      ...b,
      available_today: !busyIds.has(b.id),
    }))

    return Response.json(result)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}