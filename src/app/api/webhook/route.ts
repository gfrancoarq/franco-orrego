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

// Función para obtener disponibilidad real protegiendo privacidad
async function getAvailableSlots() {
  try {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30); // Buscamos en los próximos 30 días

    const response = await calendar.events.list({
      calendarId: 'primary', 
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50
    });

    // Filtro de seguridad: Solo enviamos horas ocupadas, no detalles privados
    return response.data.items?.map((e: any) => ({
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date
    })) || [];
  } catch (e) { 
    console.error("Error al consultar Google Calendar:", e);
    return []; 
  }
}

// 3. WEBHOOK VERIFICACIÓN (GET)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// 4. PROCESAMIENTO DE MENSAJES (POST)
export async function POST(req: Request) {
  const body = await req.json();
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const messageId = message.id;

  // A. ANTI-SPAM: Evitamos procesar el mismo mensaje de Meta dos veces
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ 
        phone_number: from, 
        role: 'user', 
        content: text,
        message_id: messageId 
    });

  if (insertError && insertError.code === '23505') return new NextResponse('OK', { status: 200 });

  // B. GESTIÓN DE DATOS DEL CLIENTE (Nombre y Temperatura)
  const { data: customerData } = await supabase.from('customers').select('full_name').eq('phone_number', from).maybeSingle();
  const { data: chatData } = await supabase.from('chats').upsert({ phone_number: from }, { onConflict: 'phone_number' }).select().single();
  
  let msgCount = (chatData?.total_messages || 0) + 1;
  await supabase.from('chats').update({ total_messages: msgCount }).eq('phone_number', from);

  // C. CONSULTA DE DISPONIBILIDAD REAL
  let infoCalendario = "";
  if (text.toLowerCase().match(/fecha|disponible|cuándo|dia|día|si|mándame|mandame/)) {
    const eventos = await getAvailableSlots();
    const hoy = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    infoCalendario = `
      \n(REGLAS DE AGENDA:
      - HOY ES: ${hoy}.
      - HORARIOS FRANCO: Lun-Vie (10:00-15:00), Sáb (09:00-14:00), Dom (16:00-21:00).
      - BLOQUES OCUPADOS: ${JSON.stringify(eventos.slice(0,15))}.
      - TAREA: Cruza tus horarios con lo ocupado y da 7 opciones LIBRES REALES. No inventes días.)
    `;
  }

  // D. CONSULTA DE HISTORIAL (Corto para evitar redundancia)
  const { data: history } = await supabase
    .from('messages')
    .select('role, content')
    .eq('phone_number', from)
    .order('created_at', { ascending: true })
    .limit(5);

  // E. INVOCAR A GROQ (Configuración de Precisión)
  const contextoLead = `\n(IMPORTANTE: Cliente es ${customerData?.full_name || 'Gustavo'}. Sé concisa, directa y empuja al cierre con el abono de $40.000. ${infoCalendario})`;
  
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: ALICIA_PROMPT + contextoLead },
      ...(history || []).map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: "user", content: text }
    ] as any,
    model: "llama-3.3-70b-versatile",
    temperature: 0, // Cero creatividad para evitar alucinaciones de fechas
    max_tokens: 350
  });

  const responseText = completion.choices[0]?.message?.content || "";

  // F. ENVÍO FRACCIONADO (Párrafos)
  const paragraphs = responseText.split(/\n\n+/).filter(p => p.trim().length > 0);
  for (const p of paragraphs) {
    await sendToWhatsApp(from, p.trim());
    await new Promise(resolve => setTimeout(resolve, 3000)); 
  }

  // G. GUARDAR RESPUESTA DE ALICIA
  await supabase.from('messages').insert({ 
    phone_number: from, 
    role: 'assistant', 
    content: responseText 
  });

  return new NextResponse('OK', { status: 200 });
}

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