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

    const { data: appointment, error } = await supabase
      .from("appointments")
      .insert([
        {
          customer_name,
          customer_phone,
          barber_id,
          service_id,
          scheduled_at,
          business_id,
          source,
          status: "confirmed",
        },
      ])
      .select("id, customer_name, customer_phone, barber_id, service_id, scheduled_at, status, source")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: corsHeaders() }
      );
    }

    const { data: barber } = await supabase
      .from("barbers")
      .select("name")
      .eq("id", barber_id)
      .single();

    const { data: service } = await supabase
      .from("services")
      .select("name")
      .eq("id", service_id)
      .single();

    return NextResponse.json(
      {
        success: true,
        confirmed: true,
        message: "Appointment booked successfully",
        appointment_id: appointment.id,
        confirmation_code: generateConfirmationCode(appointment.id),
        customer_name: appointment.customer_name,
        customer_phone: appointment.customer_phone,
        scheduled_at: appointment.scheduled_at,
        barber_id: appointment.barber_id,
        barber_name: barber?.name ?? null,
        service_id: appointment.service_id,
        service_name: service?.name ?? null,
        status: appointment.status,
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