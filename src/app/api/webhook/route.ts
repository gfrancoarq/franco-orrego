// 1. IMPORTS
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { google } from 'googleapis';
import { ALICIA_PROMPT } from './prompt';

// 2. CONFIGURACIONES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// CORRECCIÓN: Estructura correcta para JWT de Google
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CALENDAR_EMAIL,
  key: process.env.GOOGLE_CALENDAR_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});

const calendar = google.calendar({ version: 'v3', auth });

async function getAvailableSlots() {
  try {
    const now = new Date();
    const end = new Date();
    end.setDate(now.getDate() + 30); 

    const response = await calendar.events.list({
      calendarId: 'primary', 
      timeMin: now.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50
    });

    // Filtro de privacidad para no enviar datos sensibles a la IA
    return response.data.items?.map((e: any) => ({
      inicio: e.start.dateTime || e.start.date,
      fin: e.end.dateTime || e.end.date
    })) || [];
  } catch (e) { 
    console.error("Error Calendario:", e);
    return []; 
  }
}

// 3. WEBHOOK GET
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

// 4. WEBHOOK POST
export async function POST(req: Request) {
  const body = await req.json();
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const messageId = message.id;

  // A. ANTI-SPAM
  const { error: insertError } = await supabase
    .from('messages')
    .insert({ phone_number: from, role: 'user', content: text, message_id: messageId });

  if (insertError && insertError.code === '23505') return new NextResponse('OK', { status: 200 });

  // B. NOMBRE Y TEMPERATURA
  const { data: customerData } = await supabase.from('customers').select('full_name').eq('phone_number', from).maybeSingle();
  const nombreReal = customerData?.full_name || "Gustavo";

  // C. CALENDARIO REAL
  let infoCalendario = "";
  if (text.toLowerCase().match(/fecha|disponible|cuándo|dia|día|si|mándame|mandame/)) {
    const eventos = await getAvailableSlots();
    // Enviamos esto para que Alicia no invente y vea los huecos reales
    infoCalendario = `\n(IMPORTANTE: Hoy es ${new Date().toLocaleDateString()}. Estos son los eventos OCUPADOS: ${JSON.stringify(eventos.slice(0,10))}. Sugiere 7 fechas LIBRES reales respetando los bloques de Franco.)`;
  }

  // D. CONSULTA DE HISTORIAL
  const { data: history } = await supabase.from('messages').select('role, content').eq('phone_number', from).order('created_at', { ascending: true }).limit(4);

  // E. RESPUESTA CON GROQ
  const contextoLead = `\n(Cliente: ${nombreReal}. No lo llames Juan. No repitas precios. ${infoCalendario})`;
  
  const completion = await groq.chat.completions.create({
    messages: [
      { role: "system", content: ALICIA_PROMPT + contextoLead },
      ...(history || []).map((msg: any) => ({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content })),
      { role: "user", content: text }
    ] as any,
    model: "llama-3.3-70b-versatile",
    temperature: 0.2, 
    max_tokens: 400
  });

  const responseText = completion.choices[0]?.message?.content || "";

  // F. ENVÍO FRACCIONADO
  const paragraphs = responseText.split(/\n\n+/).filter(p => p.trim().length > 0);
  for (const p of paragraphs) {
    await sendToWhatsApp(from, p.trim());
    await new Promise(resolve => setTimeout(resolve, 2000)); 
  }

  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });
  return new NextResponse('OK', { status: 200 });
}

// G. FUNCIÓN AUXILIAR (Faltaba en tu archivo)
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