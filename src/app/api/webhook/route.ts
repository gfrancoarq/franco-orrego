// 1. IMPORTS (SIEMPRE ARRIBA)
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ALICIA_PROMPT } from './prompt';

// 2. CONFIGURACIONES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CALENDAR_EMAIL,
  key: process.env.GOOGLE_CALENDAR_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
});
const calendar = google.calendar({ version: 'v3', auth });

// 3. FUNCIONES AUXILIARES (DEFINIDAS ANTES DEL POST)
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
    return response.data.items?.map((e: any) => {
      const d = new Date(e.start.dateTime || e.start.date);
      return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    }) || [];
  } catch (e) { return []; }
}

// 4. WEBHOOK VERIFICACIÓN (GET)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// 5. PROCESAMIENTO PRINCIPAL (POST)
export async function POST(req: Request) {
  const body = await req.json();
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const isImage = message.type === 'image';

  // A. ESTADO MANUAL Y ANTI-SPAM
  const { data: chatStatus } = await supabase.from('chats').select('is_manual').eq('phone_number', from).maybeSingle();
  if (chatStatus?.is_manual) return new NextResponse('OK', { status: 200 });

  const { error: insertError } = await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text, message_id: message.id 
  });
  if (insertError && insertError.code === '23505') return new NextResponse('OK', { status: 200 });

  // B. FILTRO DE INTENCIÓN POST-COTIZACIÓN
  const { data: lastQuotes } = await supabase.from('messages')
    .select('content').eq('phone_number', from).eq('role', 'assistant')
    .or('content.ilike.%$%,content.ilike.%sesión%,content.ilike.%valor%').limit(1);

  const cotizacionEntregada = lastQuotes && lastQuotes.length > 0;
  const tieneIntencion = text.toLowerCase().match(/interesa|quiero|hacerlo|agendar|fecha|reserva/i);

  if (tieneIntencion && cotizacionEntregada) {
    await supabase.from('chats').update({ is_manual: true, lead_temperature: 'caliente' }).eq('phone_number', from);
    await sendToWhatsApp(from, "¡Excelente decisión! Como ya tienes los detalles del presupuesto, le aviso a Mari ahora mismo para que tome el control y veamos tu fecha. ¡Hablamos pronto! 🤘");
    return new NextResponse('OK', { status: 200 });
  }

  // C. GENERACIÓN DE RESPUESTA (FAILOVER GROQ/GEMINI)
  let responseText = "";
  const promptContexto = `\n(Info: Cotización enviada: ${cotizacionEntregada ? 'SÍ' : 'NO'})`;

  try {
    if (isImage) throw new Error("VISION");
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: ALICIA_PROMPT + promptContexto }, { role: "user", content: text }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.3
    });
    responseText = completion.choices[0]?.message?.content || "";
  } catch (e) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([ALICIA_PROMPT + promptContexto, text]);
    responseText = result.response.text();
  }

  // D. ENVÍO Y GUARDADO
  await sendToWhatsApp(from, responseText.trim());
  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });

  return new NextResponse('OK', { status: 200 });
}