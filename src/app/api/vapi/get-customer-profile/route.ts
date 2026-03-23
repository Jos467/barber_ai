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

function normalizeHnPhone(input: string) {
  // Quita espacios, guiones, paréntesis, etc. Mantiene + si existe.
  const cleaned = input.trim().replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+")) return cleaned;

  // Solo Honduras: si no viene con + asumimos +504
  return `+504${cleaned}`;
}

function toolResult(toolCallId: string | null, result: unknown) {
  return NextResponse.json(
    { results: [{ toolCallId, result }] },
    { status: 200, headers: corsHeaders() }
  );
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

    const phoneRaw = args?.phone;
    const business_id =
      args?.business_id || "aaaaaaaa-0000-0000-0000-000000000001";

    if (!phoneRaw || typeof phoneRaw !== "string") {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: "phone is required (string)",
      });
    }

    const phoneE164 = normalizeHnPhone(phoneRaw);
    const phoneLocal = phoneE164.replace(/^\+504/, ""); // compat con datos viejos

    // Lookup tolerante: busca +504XXXXXXXX o XXXXXXXX
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, business_id")
      .eq("business_id", business_id)
      .or(`phone.eq.${phoneE164},phone.eq.${phoneLocal}`)
      .maybeSingle();

    if (error) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: error.message,
      });
    }

    if (!data) {
      return toolResult(toolCallId, {
        success: true,
        found: false,
        phone: phoneE164,
      });
    }

    return toolResult(toolCallId, {
      success: true,
      found: true,
      customer_id: data.id,
      name: data.name,
      phone: phoneE164, // devolvemos normalizado aunque en DB esté viejo
      business_id: data.business_id,
      stored_phone: data.phone, // útil para debug/migración
    });
  } catch (error) {
    return toolResult(toolCallId, {
      success: false,
      error: true,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}