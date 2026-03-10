import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(request.url)
    const date       = searchParams.get('date')
    const barberId   = searchParams.get('barber_id')
    const businessId = searchParams.get('business_id')

    if (!date) return Response.json(
      { error: 'date param required (YYYY-MM-DD)' },
      { status: 400 }
    )

    const supabase = createAdminClient()

    let query = supabase
      .from('appointments')
      .select('scheduled_at, duration_minutes, barber_id')
      .gte('scheduled_at', `${date}T00:00:00`)
      .lte('scheduled_at', `${date}T23:59:59`)
      .in('status', ['confirmed', 'pending'])

    if (barberId)   query = query.eq('barber_id', barberId)
    if (businessId) query = query.eq('business_id', businessId)

    const { data: booked, error } = await query
    if (error) throw error

    const bookedTimes = new Set(
      (booked || []).map((a: any) => new Date(a.scheduled_at).toTimeString().slice(0, 5))
    )

    const slots: { time: string; available: boolean }[] = []
    for (let hour = 8; hour < 19; hour++) {
      for (const min of [0, 30]) {
        const time = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`
        slots.push({ time, available: !bookedTimes.has(time) })
      }
    }

    return Response.json(slots)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}