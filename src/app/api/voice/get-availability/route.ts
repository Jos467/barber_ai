import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.INTERNAL_API_KEY || "barberai_secret_2026";
const BASE_URL = "https://barber-ai-nxon.vercel.app";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
    const date = body?.date;

    if (!date) {
      return NextResponse.json(
        { error: "Missing date", received: body },
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
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500, headers: corsHeaders() }
    );
  }
}