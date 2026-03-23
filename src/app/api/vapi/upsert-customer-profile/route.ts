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
  const cleaned = input.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
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
    const nameRaw = args?.name;
    const business_id =
      args?.business_id || "aaaaaaaa-0000-0000-0000-000000000001";

    if (!phoneRaw || typeof phoneRaw !== "string") {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: "phone is required (string)",
      });
    }

    if (!nameRaw || typeof nameRaw !== "string") {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: "name is required (string)",
      });
    }

    const phoneE164 = normalizeHnPhone(phoneRaw);
    const phoneLocal = phoneE164.replace(/^\+504/, "");

    const name = nameRaw.trim();

    // 1) Busca si existe (tolerante)
    const { data: existing, error: findError } = await supabase
      .from("customers")
      .select("id, name, phone, business_id")
      .eq("business_id", business_id)
      .or(`phone.eq.${phoneE164},phone.eq.${phoneLocal}`)
      .maybeSingle();

    if (findError) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: findError.message,
      });
    }

    // 2) Si existe: actualiza nombre (si cambia) y normaliza phone a +504...
    if (existing?.id) {
      const updates: Record<string, any> = {};

      if (typeof existing.name === "string" && existing.name.trim() !== name) {
        updates.name = name;
      }

      // Normaliza el stored phone para que quede siempre E.164
      if (typeof existing.phone === "string" && existing.phone !== phoneE164) {
        updates.phone = phoneE164;
      }

      if (Object.keys(updates).length === 0) {
        return toolResult(toolCallId, {
          success: true,
          action: "no_change",
          customer_id: existing.id,
          name: existing.name,
          phone: phoneE164,
          business_id: existing.business_id,
        });
      }

      const { data: updated, error: updateError } = await supabase
        .from("customers")
        .update(updates)
        .eq("id", existing.id)
        .select("id, name, phone, business_id")
        .single();

      if (updateError) {
        return toolResult(toolCallId, {
          success: false,
          error: true,
          message: updateError.message,
        });
      }

      return toolResult(toolCallId, {
        success: true,
        action: "updated",
        customer_id: updated.id,
        name: updated.name,
        phone: updated.phone,
        business_id: updated.business_id,
      });
    }

    // 3) Si no existe: crea (guardando phone ya normalizado)
    const { data: inserted, error: insertError } = await supabase
      .from("customers")
      .insert([{ business_id, phone: phoneE164, name }])
      .select("id, name, phone, business_id")
      .single();

    if (insertError) {
      return toolResult(toolCallId, {
        success: false,
        error: true,
        message: insertError.message,
      });
    }

    return toolResult(toolCallId, {
      success: true,
      action: "created",
      customer_id: inserted.id,
      name: inserted.name,
      phone: inserted.phone,
      business_id: inserted.business_id,
    });
  } catch (error) {
    return toolResult(toolCallId, {
      success: false,
      error: true,
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}