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

function generateTimeSlots(
  startHour = 9,
  endHour = 18,
  intervalMinutes = 30
) {
  const slots: string[] = [];

  for (let hour = startHour; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += intervalMinutes) {
      const hh = String(hour).padStart(2, "0");
      const mm = String(min).padStart(2, "0");
      slots.push(`${hh}:${mm}`);
    }
  }

  return slots;
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

    const date = args?.date;
    const barber_id = args?.barber_id || null;
    const requested_time = args?.requested_time || null;
    const business_id =
      args?.business_id || "aaaaaaaa-0000-0000-0000-000000000001";

    if (!date || typeof date !== "string") {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: "date is required in format YYYY-MM-DD",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: "date must be YYYY-MM-DD",
      });
    }

    const startOfDay = `${date}T00:00:00-06:00`;
    const endOfDay = `${date}T23:59:59-06:00`;

    let query = supabase
      .from("appointments")
      .select("scheduled_at, barber_id, status")
      .eq("business_id", business_id)
      .gte("scheduled_at", startOfDay)
      .lte("scheduled_at", endOfDay)
      .in("status", ["pending", "confirmed"]);

    if (barber_id) {
      query = query.eq("barber_id", barber_id);
    }

    const { data: appointments, error } = await query;

    if (error) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: error.message,
      });
    }

    const bookedTimes = new Set(
      (appointments ?? []).map((appointment) => {
        const dateObj = new Date(appointment.scheduled_at);
        const hh = String(dateObj.getHours()).padStart(2, "0");
        const mm = String(dateObj.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      })
    );

    const allSlots = generateTimeSlots(9, 18, 30);

    const availability = allSlots.map((slot) => ({
      time: slot,
      available: !bookedTimes.has(slot),
    }));

    const requestedSlot =
      requested_time && typeof requested_time === "string"
        ? availability.find((slot) => slot.time === requested_time) ?? null
        : null;

    const nextAvailableSlots = availability
      .filter((slot) => slot.available)
      .slice(0, 5)
      .map((slot) => slot.time);

    return toolResult(toolCallId, {
      success: true,
      date,
      barber_id,
      requested_time,
      requested_time_available: requestedSlot
        ? requestedSlot.available
        : null,
      next_available_slots: nextAvailableSlots,
      all_slots: availability,
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