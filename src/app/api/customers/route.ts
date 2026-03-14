import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function validateApiKey(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.INTERNAL_API_KEY;
}

export async function GET(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized — invalid or missing x-api-key' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  if (!validateApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized — invalid or missing x-api-key' }, { status: 401 });
  }

  const body = await request.json();
  const { name, phone, business_id } = body;

  if (!name || !phone || !business_id) {
    return NextResponse.json({ error: 'Faltan campos: name, phone, business_id' }, { status: 400 });
  }

  // Buscar si ya existe el cliente con ese teléfono
  const { data: existing } = await supabase
    .from('customers')
    .select('*')
    .eq('phone', phone)
    .eq('business_id', business_id)
    .single();

  if (existing) {
    return NextResponse.json(existing);
  }

  // Crear nuevo cliente
  const { data, error } = await supabase
    .from('customers')
    .insert([{ name, phone, business_id }])
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}