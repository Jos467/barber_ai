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

function toolResult(toolCallId: string | null, result: unknown) {
  return NextResponse.json(
    {
      results: [
        {
          toolCallId,
          result,
        },
      ],
    },
    {
      status: 200,
      headers: corsHeaders(),
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function POST(req: NextRequest) {
  let toolCallId: string | null = null;

  try {
    const apiKey = req.headers.get("x-api-key");

    if (apiKey !== API_KEY) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders() }
      );
    }

    const body = await req.json();

    const toolCall = body?.message?.toolCallList?.[0];
    toolCallId = toolCall?.id ?? null;

    const argsRaw = toolCall?.function?.arguments ?? {};
    const args = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;

    const {
      customer_name,
      customer_phone,
      barber_id,
      service_id,
      scheduled_at,
      business_id = "aaaaaaaa-0000-0000-0000-000000000001",
      source = "voice",
      notes = null,
    } = args ?? {};

    if (
      !customer_name ||
      !customer_phone ||
      !barber_id ||
      !service_id ||
      !scheduled_at
    ) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message:
          "customer_name, customer_phone, barber_id, service_id and scheduled_at are required",
      });
    }

    // Buscar o crear cliente
    let customerId: string | null = null;

    const { data: existingCustomer, error: existingCustomerError } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("business_id", business_id)
      .eq("phone", customer_phone)
      .maybeSingle();

    if (existingCustomerError) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: existingCustomerError.message,
      });
    }

    if (existingCustomer?.id) {
      customerId = existingCustomer.id;

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
        return toolResult(toolCallId, {
          success: false,
          error: true,
          message: createCustomerError.message,
        });
      }

      customerId = createdCustomer.id;
    }

    // Leer servicio para obtener nombre y duración
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .select("id, name, duration_minutes")
      .eq("id", service_id)
      .eq("business_id", business_id)
      .single();

    if (serviceError) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: serviceError.message,
      });
    }

    // Verificar conflicto de horario
    const { data: conflicting, error: conflictError } = await supabase
      .from("appointments")
      .select("id")
      .eq("business_id", business_id)
      .eq("barber_id", barber_id)
      .eq("scheduled_at", scheduled_at)
      .in("status", ["pending", "confirmed"])
      .limit(1);

    if (conflictError) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: conflictError.message,
      });
    }

    if (conflicting && conflicting.length > 0) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: "This time slot is no longer available",
      });
    }

    // Insertar cita
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
      .select(
        "id, business_id, barber_id, customer_id, service_id, scheduled_at, duration_minutes, status, source, created_at"
      )
      .single();

    if (appointmentError) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: appointmentError.message,
      });
    }

    // Obtener nombre del barbero
    const { data: barber } = await supabase
      .from("barbers")
      .select("name")
      .eq("id", barber_id)
      .single();

    return toolResult(toolCallId, {
      success: true,
      confirmed: true,
      message: "Appointment booked successfully",
      id: appointment.id,
      appointment_id: appointment.id,
      confirmation_code: generateConfirmationCode(appointment.id),
      customer_name,
      customer_phone,
      scheduled_at: appointment.scheduled_at,
      barber_id: appointment.barber_id,
      barber_name: barber?.name ?? null,
      service_id: appointment.service_id,
      service_name: service.name,
      duration_minutes: appointment.duration_minutes,
      status: appointment.status,
      source: appointment.source,
    });
  } catch (error) {
    return toolResult(toolCallId, {
      success: false,
      error: true,
      message:
        error instanceof Error ? error.message : "Internal server error",
    });
  }
}