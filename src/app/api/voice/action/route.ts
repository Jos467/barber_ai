import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY || "barberai_secret_2026";
const BASE_URL = "https://barber-ai-nxon.vercel.app";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    "Content-Type": "application/json",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (action === "get_availability") {
      const date = payload?.date;
      if (!date) {
        return NextResponse.json(
          { error: "Missing date" },
          { status: 400, headers: corsHeaders() }
        );
      }

      const res = await fetch(
        `${BASE_URL}/api/appointments/availability?date=${encodeURIComponent(date)}`,
        {
          method: "GET",
          headers: {
            "x-api-key": API_KEY,
          },
        }
      );

      const data = await res.json();
      return NextResponse.json(data, {
        status: res.status,
        headers: corsHeaders(),
      });
    }

    if (action === "create_customer") {
      const res = await fetch(`${BASE_URL}/api/customers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          name: payload?.name,
          phone: payload?.phone,
          business_id: "aaaaaaaa-0000-0000-0000-000000000001",
        }),
      });

      const data = await res.json();
      return NextResponse.json(data, {
        status: res.status,
        headers: corsHeaders(),
      });
    }

    if (action === "book_appointment") {
      const scheduled_at = `${payload?.date}T${payload?.time}:00-06:00`;

      const res = await fetch(`${BASE_URL}/api/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          customer_name: payload?.customer_name,
          customer_phone: payload?.customer_phone,
          scheduled_at,
          source: "voice",
          barber_id: "bbbbbbbb-0000-0000-0000-000000000002",
          service_id: "cccccccc-0000-0000-0000-000000000001",
          business_id: "aaaaaaaa-0000-0000-0000-000000000001",
        }),
      });

      const data = await res.json();
      return NextResponse.json(data, {
        status: res.status,
        headers: corsHeaders(),
      });
    }

    return NextResponse.json(
      { error: "Unsupported action" },
      { status: 400, headers: corsHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500, headers: corsHeaders() }
    );
  }
}