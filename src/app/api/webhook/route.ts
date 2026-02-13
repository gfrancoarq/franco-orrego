// 1. IMPORTS (Siempre al principio)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { google } from 'googleapis';
import { ALICIA_PROMPT } from './prompt';

// 2. CONFIGURACIONES INICIALES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Configuración de Google Calendar (Estructura corregida para JWT)
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CALENDAR_EMAIL,
  key: process.env.GOOGLE_CALENDAR_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

// ... (Imports y configuraciones iniciales de Groq/Supabase/Auth se mantienen igual)

// MEJORA: Función de calendario que entrega texto legible y no JSON complejo
async function getAvailableSlots() {
  try {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 20); 

    const response = await calendar.events.list({
      calendarId: 'primary', 
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Convertimos la respuesta de Google en una lista de días legibles para Chile
    return response.data.items?.map((e: any) => {
      const d = new Date(e.start.dateTime || e.start.date);
      return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    }) || [];
  } catch (e) { 
    console.error("Error en Google Calendar:", e);
    return []; 
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";

  // A. ANTI-SPAM (Tabla messages)
  const { error: insertError } = await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text, message_id: message.id 
  });
  if (insertError && insertError.code === '23505') return new NextResponse('OK', { status: 200 });

  // B. OBTENER NOMBRE DESDE LA DB (Para evitar alucinaciones como 'Juan')
  const { data: customer } = await supabase.from('customers').select('full_name').eq('phone_number', from).maybeSingle();
  const nombreReal = customer?.full_name || "Cliente";

  // C. PREPARACIÓN DE CALENDARIO MASTICADO
  let infoCalendario = "";
  if (text.toLowerCase().match(/fecha|disponible|cuándo|dia|día|si/)) {
    const ocupados = await getAvailableSlots();
    const hoyStr = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    
    infoCalendario = `\n--- INFO DE AGENDA ---
    HOY ES: ${hoyStr}.
    REGLA: La semana empieza el LUNES.
    DÍAS OCUPADOS (NO sugerir estos): ${ocupados.join(", ")}.
    TAREA: Sugiere 7 fechas LIBRES reales en tus bloques: Mañana (10-15), Sáb (9-14), Dom (16-21).`;
  }

  // D. CONSULTA A GROQ (Foco en una sola cosa y brevedad)
  const completion = await groq.chat.completions.create({
    messages: [
      { 
        role: "system", 
        content: ALICIA_PROMPT + `\nIDENTIDAD: Hablas con ${nombreReal}. Prohibido usar otros nombres.
        REGLA DE FLUJO: Responde una sola cosa a la vez de forma breve. Si das fechas, que sea un solo bloque.` 
      },
      { role: "user", content: text + infoCalendario }
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0, // Cero creatividad para que no invente fechas
    max_tokens: 300
  });

  const responseText = completion.choices[0]?.message?.content || "";

  // E. ENVÍO ÚNICO (Para que no sea agobiante)
  await sendToWhatsApp(from, responseText.trim());

  // F. GUARDAR RESPUESTA
  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });

  return new NextResponse('OK', { status: 200 });
}

// ... (Función sendToWhatsApp igual al final)
// 5. FUNCIÓN AUXILIAR DE ENVÍO (Meta v22.0)
async function sendToWhatsApp(to: string, text: string) {
  await fetch(`https://graph.facebook.com/v22.0/${process.env.META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.META_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      text: { body: text },
    }),
  });
}