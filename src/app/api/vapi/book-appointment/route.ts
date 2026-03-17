import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_KEY = process.env.BARBER_AI_API_KEY || "barberai_secret_2026";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  };
}

function generateConfirmationCode(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = req.headers.get("x-api-key");

    if (apiKey !== API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const body = await req.json().catch(() => ({}));

    const {
      customer_name,
      customer_phone,
      barber_id,
      service_id,
      scheduled_at,
      business_id = "aaaaaaaa-0000-0000-0000-000000000001",
      source = "voice",
      notes = null,
    } = body;

    if (
      !customer_name ||
      !customer_phone ||
      !barber_id ||
      !service_id ||
      !scheduled_at
    ) {
      return NextResponse.json(
        {
          error:
            "customer_name, customer_phone, barber_id, service_id and scheduled_at are required",
        },
        { status: 400, headers: corsHeaders() }
      );
    }

    // 1) Buscar o crear cliente por teléfono
    let customerId: string | null = null;

    const { data: existingCustomer, error: existingCustomerError } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("business_id", business_id)
      .eq("phone", customer_phone)
      .maybeSingle();

    if (existingCustomerError) {
      return NextResponse.json(
        { error: existingCustomerError.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;

      // Actualizar nombre si vino distinto o estaba vacío
      if (existingCustomer.name !== customer_name) {
        await supabase
          .from("customers")
          .update({ name: customer_name })
          .eq("id", existingCustomer.id);
      }
    } else {
      const { data: createdCustomer, error: createCustomerError } = await supabase
        .from("customers")
        .insert([
          {
            business_id,
            name: customer_name,
            phone: customer_phone,
          },
        ])
        .select("id")
        .single();

      if (createCustomerError) {
        return NextResponse.json(
          { error: createCustomerError.message },
          { status: 500, headers: corsHeaders() }
        );
      }

      customerId = createdCustomer.id;
    }

    // 2) Leer servicio para obtener duración
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id, name, duration_minutes")
      .eq("id", service_id)
      .eq("business_id", business_id)
      .single();

    if (serviceError) {
      return NextResponse.json(
        { error: serviceError.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    // 3) Validar conflicto exacto
    const { data: conflicting, error: conflictError } = await supabase
      .from("appointments")
      .select("id")
      .eq("business_id", business_id)
      .eq("barber_id", barber_id)
      .eq("scheduled_at", scheduled_at)
      .in("status", ["pending", "confirmed"])
      .limit(1);

    if (conflictError) {
      return NextResponse.json(
        { error: conflictError.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    if (conflicting && conflicting.length > 0) {
      return NextResponse.json(
        { error: "This time slot is no longer available" },
        { status: 409, headers: corsHeaders() }
      );
    }

    // 4) Insertar cita completa
    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .insert([
        {
          business_id,
          barber_id,
          customer_id: customerId,
          service_id,
          scheduled_at,
          duration_minutes: service.duration_minutes,
          status: "confirmed",
          source,
          notes,
        },
      ])
      .select("id, business_id, barber_id, customer_id, service_id, scheduled_at, duration_minutes, status, source, created_at")
      .single();

    if (appointmentError) {
      return NextResponse.json(
        { error: appointmentError.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    // 5) Leer nombre del barbero
    const { data: barber } = await supabase
      .from("barbers")
      .select("name")
      .eq("id", barber_id)
      .single();

    return NextResponse.json(
      {
        success: true,
        confirmed: true,
        id: appointment.id,
        scheduled_at: appointment.scheduled_at,
        barber_name: barber?.name ?? null,
        service_name: service.name,
        customer_name,
        confirmation_code: generateConfirmationCode(appointment.id),
        source: appointment.source,
      },
      { status: 200, headers: corsHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500, headers: corsHeaders() }
    );
  }
}