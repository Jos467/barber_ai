import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { validateApiKey, unauthorizedResponse } from '@/lib/api-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const { status } = await request.json()
    const valid = ['pending', 'confirmed', 'completed', 'cancelled']

    if (!status || !valid.includes(status)) {
      return Response.json(
        { error: `Estado inválido. Debe ser: ${valid.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const { error } = await supabase
      .from('appointments').update({ status }).eq('id', params.id)

    if (error) throw error

    return Response.json({ success: true, id: params.id, status })
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateApiKey(request)) return unauthorizedResponse()

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('appointments')
      .select('*, customer:customers(id,name,phone), barber:barbers(id,name), service:services(id,name,price)')
      .eq('id', params.id)
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}