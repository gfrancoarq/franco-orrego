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

// --- WEBHOOK GET ---
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// --- PROCESAMIENTO PRINCIPAL POST ---
export async function POST(req: Request) {
  const body = await req.json();

  // 1. LÓGICA DE LA CONSOLA (Órdenes manuales de Franco o Mari)
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

  // A. Guardado inicial
  await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text || "[IMAGEN]", message_id: message.id 
  });

  // B. REGLAS DE SILENCIO E IA (Interruptores)
  const { data: chatConfig } = await supabase.from('chats')
    .select('is_manual, ai_enabled, ai_response_count')
    .eq('phone_number', from)
    .maybeSingle();

  // Si el chat es manual, o la IA está apagada, o Alicia ya respondió una vez, NO HACEMOS NADA.
  if (chatConfig?.is_manual || chatConfig?.ai_enabled === false || (chatConfig?.ai_response_count || 0) >= 1) {
    return new NextResponse('OK', { status: 200 });
  }

  // C. SALUDO INTELIGENTE (Día vs Noche en Santiago)
  const now = new Date();
  const horaSantiago = now.getUTCHours() - 3; // Ajuste manual para Chile
  const esDeNoche = horaSantiago < 9 || horaSantiago >= 20;

  if (!esDeNoche) {
    // HORARIO DÍA: Enviamos el Audio de Bienvenida Maestro (Debes poner el ID real del disparador aquí)
    // Usamos el ID de tu disparador "Saludo Inicial" que creaste en la consola
    const { data: welcomeTemplate } = await supabase.from('templates')
      .select('id')
      .eq('label', 'Saludo Inicial') // Asegúrate que se llame así en tu consola
      .single();

    if (welcomeTemplate) {
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/webhook`, {
        method: 'POST',
        body: JSON.stringify({ action: 'send_template', phone_number: from, template_id: welcomeTemplate.id })
      });
      // Marcamos que ya se dio el primer saludo para apagar la IA
      await supabase.from('chats').update({ ai_response_count: 1 }).eq('phone_number', from);
      return new NextResponse('OK', { status: 200 });
    }
  } else {
    // HORARIO NOCHE: Alicia responde por texto y pide los 3 insumos
    const { data: nightMsg } = await supabase.from('settings').select('value').eq('key', 'alicia_night_prompt').single();
    await sendToWhatsApp(from, nightMsg?.value || "Hola! Franco está descansando. Deja tu idea, zona y medidas aquí.");
    await supabase.from('chats').update({ ai_response_count: 1 }).eq('phone_number', from);
    return new NextResponse('OK', { status: 200 });
  }

  // D. SI LA IA SIGUE ACTIVA (Dudas básicas como ubicación)
  // Nota: No analiza imágenes por tu petición.
  if (isImage) return new NextResponse('OK', { status: 200 });

  let responseText = "";
  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: ALICIA_PROMPT }, { role: "user", content: text }],
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      max_tokens: 150
    });
    responseText = completion.choices[0]?.message?.content || "";
  } catch (e) {
    responseText = "Consultaré con Franco y te aviso pronto. 🤘";
  }

  // E. Envío de respuesta de IA (Delay de 20 segundos)
  await new Promise(res => setTimeout(res, 20000)); 
  await sendToWhatsApp(from, responseText.trim());
  
  // Guardamos respuesta y actualizamos contador para que la IA se apague
  await supabase.from('messages').insert({ phone_number: from, role: 'assistant', content: responseText });
  await supabase.from('chats').update({ ai_response_count: (chatConfig?.ai_response_count || 0) + 1 }).eq('phone_number', from);

  return new NextResponse('OK', { status: 200 });
}