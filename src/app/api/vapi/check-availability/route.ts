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
    const date = body.date;
    const barber_id = body.barber_id || null;
    const business_id =
      body.business_id || "aaaaaaaa-0000-0000-0000-000000000001";

    if (!date || typeof date !== "string") {
      return NextResponse.json(
        { error: "date is required in format YYYY-MM-DD" },
        { status: 400, headers: corsHeaders() }
      );
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
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: corsHeaders() }
      );
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
    const available_slots = allSlots.filter((slot) => !bookedTimes.has(slot));

    return NextResponse.json(
      {
        success: true,
        date,
        barber_id,
        available_slots,
        booked_slots: Array.from(bookedTimes),
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