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

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
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

    const business_id =
      args?.business_id || "aaaaaaaa-0000-0000-0000-000000000001";

    const { data, error } = await supabase
      .from("barbers")
      .select("id, name, active")
      .eq("business_id", business_id)
      .eq("active", true)
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          results: [
            {
              toolCallId,
              result: { success: false, error: true, message: error.message },
            },
          ],
        },
        { status: 200, headers: corsHeaders() }
      );
    }

    const barbers = (data ?? []).map((b: any, index: number) => ({
      id: b.id,
      name: b.name,
      is_default_for_no_preference: index === 0, // o define tu lógica de "default" real
    }));

    return NextResponse.json(
      { results: [{ toolCallId, result: barbers }] },
      { status: 200, headers: corsHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      {
        results: [
          {
            toolCallId,
            result: {
              success: false,
              error: true,
              message: error instanceof Error ? error.message : "Internal server error",
            },
          },
        ],
      },
      { status: 200, headers: corsHeaders() }
    );
  }
}