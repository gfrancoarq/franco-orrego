import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ALICIA_PROMPT } from './prompt';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// --- FUNCIONES DE ENVÍO ---

async function sendToWhatsApp(to: string, text: string) {
  await fetch(`https://graph.facebook.com/v22.0/${process.env.META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, text: { body: text } }),
  });
}

// Envía audios como notas de voz nativas
async function sendNativeAudio(to: string, audioUrl: string) {
  await fetch(`https://graph.facebook.com/v22.0/${process.env.META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.META_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'audio',
      audio: { link: audioUrl }
    }),
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: Request) {
  const body = await req.json();

  // 1. LÓGICA DE LA CONSOLA (Órdenes de Franco o Mari)
  if (body.action === 'send_template') {
    const { phone_number, template_id } = body;
    if (phone_number === 'test_account') return new NextResponse('OK', { status: 200 });

    const { data: template } = await supabase.from('templates').select('*').eq('id', template_id).single();
    
    if (template) {
      if (template.type === 'audio') {
        await sendNativeAudio(phone_number, template.content);
      } else {
        await sendToWhatsApp(phone_number, template.content);
      }
    }
    return new NextResponse('OK', { status: 200 });
  }

  // 2. LÓGICA DE MENSAJES ENTRANTES (Clientes)
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const isImage = message.type === 'image';

  // A. Guardado y Control de Estado
  await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text || "[IMAGEN]", message_id: message.id 
  });
  
  const { data: chat } = await supabase.from('chats').select('*').eq('phone_number', from).maybeSingle();
  
  // Si el chat está en manual, no hacemos nada más
  if (chat?.is_manual) return new NextResponse('OK', { status: 200 });

  // B. Memoria
  const { data: history } = await supabase.from('messages')
    .select('role, content').eq('phone_number', from).order('created_at', { ascending: false }).limit(6);
  
  const cleanHistory = (history || []).reverse();
  const yaCotizado = cleanHistory.some(m => m.role === 'assistant' && (m.content.includes('$') || m.content.includes('sesión')));

  // C. Filtro de Interés Real
  if (yaCotizado && text.toLowerCase().match(/interesa|quiero|hacerlo|agendar|fecha|reserva/)) {
    await supabase.from('chats').update({ is_manual: true, lead_temperature: 'caliente' }).eq('phone_number', from);
    await sendToWhatsApp(from, "¡Excelente! Le aviso a Mari para que vea la agenda contigo ahora mismo. 🤘");
    return new NextResponse('OK', { status: 200 });
  }

  // D. Respuesta de Alicia (Solo primer contacto o dudas básicas)
  let responseText = "";
  const promptContexto = `\n(COTIZACIÓN ENVIADA: ${yaCotizado ? 'SÍ' : 'NO'})`;

  try {
    if (isImage) throw new Error("VISION");
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: ALICIA_PROMPT + promptContexto }, ...cleanHistory.map(m => ({ role: m.role, content: m.content }))],
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 150
    });
    responseText = completion.choices[0]?.message?.content || "";
  } catch (e) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent([ALICIA_PROMPT + promptContexto, ...cleanHistory.map(m => m.content), text]);
    responseText = result.response.text();
  }

  // E. Delay de Primer Contacto (20 segundos para no parecer bot instantáneo)
  await new Promise(res => setTimeout(res, 20000)); 
  await sendToWhatsApp(from, responseText.trim());
  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });

  return new NextResponse('OK', { status: 200 });
}