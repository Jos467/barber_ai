import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const date       = searchParams.get('date')
    const status     = searchParams.get('status')
    const businessId = searchParams.get('business_id')

    let query = supabase
      .from('appointments')
      .select('*, customer:customers(id,name,phone), barber:barbers(id,name), service:services(id,name,price,duration_minutes)')
      .order('scheduled_at', { ascending: true })

    if (date) {
      query = query
        .gte('scheduled_at', `${date}T00:00:00`)
        .lte('scheduled_at', `${date}T23:59:59`)
    }
    if (status)     query = query.eq('status', status)
    if (businessId) query = query.eq('business_id', businessId)

    const { data, error } = await query
    if (error) throw error

    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const body = await request.json()
    const {
      customer_name, customer_phone, barber_id,
      service_id, scheduled_at, source = 'manual',
      business_id, notes,
    } = body

    if (!customer_name || !customer_phone || !barber_id || !service_id || !scheduled_at || !business_id) {
      return Response.json(
        { error: 'Faltan campos: customer_name, customer_phone, barber_id, service_id, scheduled_at, business_id' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    let customerId: string
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('business_id', business_id)
      .eq('phone', customer_phone)
      .single()

    if (existing) {
      customerId = existing.id
    } else {
      const { data: newCust, error: custErr } = await supabase
        .from('customers')
        .insert({ business_id, name: customer_name, phone: customer_phone })
        .select('id').single()
      if (custErr) throw custErr
      customerId = newCust!.id
    }

    const { data: service } = await supabase
      .from('services').select('name, duration_minutes').eq('id', service_id).single()

    const { data: barber } = await supabase
      .from('barbers').select('name').eq('id', barber_id).single()

    const { data: appointment, error: aptErr } = await supabase
      .from('appointments')
      .insert({
        business_id, barber_id,
        customer_id: customerId,
        service_id, scheduled_at,
        duration_minutes: service?.duration_minutes || 30,
        status: 'confirmed',
        source, notes,
      })
      .select('id, scheduled_at').single()

    if (aptErr) throw aptErr

    const confirmationCode = appointment!.id.split('-')[0].toUpperCase()

    return Response.json({
  id: appointment!.id,
  scheduled_at: appointment!.scheduled_at,
  barber_name: barber?.name || '',
  service_name: service?.name || '',
  customer_name: customer_name.replace(/^=/, ''),
  confirmation_code: confirmationCode,
}, { status: 201 })

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const { searchParams } = new URL(request.url)
    const confirmation_code = searchParams.get('confirmation_code')

    if (!confirmation_code) {
      return Response.json({ error: 'Falta confirmation_code' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .rpc('find_appointment_by_code', { code: confirmation_code })

    if (error || !data) {
      return Response.json({ error: 'Cita no encontrada' }, { status: 404 })
    }

    await supabase
      .from('appointments')
      .delete()
      .eq('id', data)

    return Response.json({ success: true, message: 'Cita eliminada correctamente' })

  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  if (!validateApiKey(request)) return unauthorizedResponse()
  try {
    const { searchParams } = new URL(request.url)
    const confirmation_code = searchParams.get('confirmation_code')
    const body = await request.json()
    if (!confirmation_code) return Response.json({ error: 'Falta confirmation_code' }, { status: 400 })
    const supabase = createAdminClient()
    const { data: appt } = await supabase.rpc('find_appointment_by_code', { code: confirmation_code })
    if (!appt) return Response.json({ error: 'Cita no encontrada' }, { status: 404 })
    const { data, error } = await supabase
      .from('appointments').update({ status: body.status || 'cancelled' }).eq('id', appt).select().single()
    if (error) throw error
    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}