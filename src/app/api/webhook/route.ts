// 1. IMPORTS (SIEMPRE ARRIBA)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { google } from 'googleapis';

// 2. PROMPT DE ALICIA (Mantén el tuyo, aquí lo resumo)
import { ALICIA_PROMPT } from './prompt';

// 3. CONFIGURACIONES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// Configuración de Google Calendar (Solo Lectura)
const calendar = google.calendar({
  version: 'v3',
  auth: new google.auth.JWT(
    process.env.GOOGLE_CALENDAR_EMAIL,
    null,
    process.env.GOOGLE_CALENDAR_KEY?.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar.readonly']
  ),
});

// Función para ver disponibilidad protegiendo tu privacidad
async function getAvailableSlots() {
  try {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 14); 

    const response = await calendar.events.list({
      calendarId: 'primary', 
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    // Filtro de seguridad: Solo enviamos a Alicia las horas ocupadas, sin títulos privados
    return response.data.items?.map((e: any) => ({
      inicio: e.start.dateTime || e.start.date,
      fin: e.end.dateTime || e.end.date
    })) || [];
  } catch (e) { 
    return []; 
  }
}

// 4. WEBHOOK VERIFICACIÓN (GET)
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

// 5. PROCESAMIENTO DE MENSAJES (POST)
export async function POST(req: Request) {
  const body = await req.json();
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const messageId = message.id;

  // A. ANTI-SPAM (Tabla messages)
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ phone_number: from, role: 'user', content: text, message_id: messageId });

  if (insertError && insertError.code === '23505') return new NextResponse('Duplicate', { status: 200 });

  // B. EXTRACCIÓN DE NOMBRE
  const nameMatch = text.match(/(?:soy|llam[oa]|nombre es)\s+([A-ZÁÉÍÓÚ][a-zñáéíóú]+)/i);
  if (nameMatch && nameMatch[1]) {
    await supabase.from('customers').upsert({ phone_number: from, full_name: nameMatch[1] }, { onConflict: 'phone_number' });
  }

  // C. GESTIÓN DE CHAT Y CALENDARIO
  const { data: chatData } = await supabase.from('chats').upsert({ phone_number: from }, { onConflict: 'phone_number' }).select().single();
  
  let infoCalendario = "";
  if (text.toLowerCase().match(/fecha|disponible|cuándo|dia|día/)) {
    const eventos = await getAvailableSlots();
    infoCalendario = `\n(DISPONIBILIDAD REAL: Estos bloques están OCUPADOS: ${JSON.stringify(eventos.slice(0,5))}. Sugiere opciones libres según las reglas de Franco.)`;
  }

  // D. CONSULTA DE CONTEXTO ESPECÍFICO
  const { data: customer } = await supabase.from('customers').select('full_name').eq('phone_number', from).maybeSingle();
  const { data: history } = await supabase.from('messages').select('role, content').eq('phone_number', from).order('created_at', { ascending: true }).limit(15);

  const nombreActual = customer?.full_name || "Desconocido";

  // E. RESPUESTA CON GROQ (Configuración Ejecutiva)
  const contextoLead = `\n(OJO: Estás hablando con ${nombreActual}. No repitas info previa. Si pide fechas, dáselas y empuja al abono de $40.000. ${infoCalendario})`;
  
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: ALICIA_PROMPT + contextoLead },
      ...(history || []).map((msg: any) => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })),
      { role: "user", content: text }
    ] as any,
    model: "llama-3.3-70b-versatile",
    temperature: 0.3, // Temperatura baja para evitar redundancia
    max_tokens: 220
  });

  const responseText = completion.choices[0]?.message?.content || "";

  // F. ENVÍO INTELIGENTE (Párrafos)
  const paragraphs = responseText.split(/\n\n+/).filter(p => p.trim().length > 0);
  for (const p of paragraphs) {
    await sendToWhatsApp(from, p.trim());
    await new Promise(resolve => setTimeout(resolve, 3000)); 
  }

  // G. GUARDAR RESPUESTA DE ALICIA
  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });

  return new NextResponse('OK', { status: 200 });
}

// Función auxiliar para Meta v22.0
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