// 1. IMPORTS
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ALICIA_PROMPT } from './prompt';

// 2. CONFIGURACIONES
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// 3. FUNCIÓN DE ENVÍO (Definida arriba para evitar errores de referencia)
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

  // A. GUARDADO Y CONTROL MANUAL
  await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text || "[IMAGEN]", message_id: message.id 
  });
  
  const { data: chat } = await supabase.from('chats').select('is_manual').eq('phone_number', from).maybeSingle();
  if (chat?.is_manual) return new NextResponse('OK', { status: 200 });

  // B. MEMORIA Y DETECCIÓN DE COTIZACIÓN
  const { data: history } = await supabase.from('messages')
    .select('role, content').eq('phone_number', from).order('created_at', { ascending: false }).limit(6);
  
  const cleanHistory = (history || []).reverse();
  // Detecta si Alicia ya entregó un precio para activar el filtro de interés
  const yaCotizado = cleanHistory.some(m => m.role === 'assistant' && (m.content.includes('$') || m.content.includes('sesión')));

  // C. FILTRO DE INTERÉS REAL (Solo manual si hay intención POST-COTIZACIÓN)
  if (yaCotizado && text.toLowerCase().match(/interesa|quiero|hacerlo|agendar|fecha|reserva/)) {
    await supabase.from('chats').update({ is_manual: true, lead_temperature: 'caliente' }).eq('phone_number', from);
    await sendToWhatsApp(from, "¡Excelente! Como ya tienes el presupuesto, le aviso a Mari para que vea la agenda contigo ahora mismo. 🤘");
    return new NextResponse('OK', { status: 200 });
  }

  // D. RESPUESTA CON FAILOVER (Groq -> Gemini)
  let responseText = "";
  // Inyectamos el contexto de seguridad para que no invente descuentos adicionales
  const promptContexto = `\n(COTIZACIÓN ENVIADA: ${yaCotizado ? 'SÍ' : 'NO'}. REGLA: $125k ya tiene el 50% OFF. NO rebajes más.)`;

  try {
    if (isImage) throw new Error("VISION");

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: ALICIA_PROMPT + promptContexto },
        ...cleanHistory.map(m => ({ role: m.role, content: m.content }))
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0, // Rigurosidad matemática para evitar errores de precio
      max_tokens: 150  // Mensajes breves y directos
    });
    responseText = completion.choices[0]?.message?.content || "";
  } catch (e) {
    // Fallback a Gemini si Groq falla o el cliente envía fotos
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([
      ALICIA_PROMPT + promptContexto, 
      ...cleanHistory.map(m => m.content), 
      text
    ]);
    responseText = result.response.text();
  }

  // E. DELAY HUMANO Y ENVÍO
  await new Promise(res => setTimeout(res, 3500)); 
  await sendToWhatsApp(from, responseText.trim());
  
  // Guardamos la respuesta de la asistente para el historial
  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });

  return new NextResponse('OK', { status: 200 });
}