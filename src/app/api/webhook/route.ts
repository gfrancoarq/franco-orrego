import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ALICIA_PROMPT } from './prompt';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// --- AYUDANTES DE ENVÍO WHATSAPP ---

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

// --- WEBHOOK VERIFICACIÓN (GET) ---
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.mode') === 'subscribe' && searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

// --- PROCESAMIENTO PRINCIPAL (POST) ---
export async function POST(req: Request) {
  const body = await req.json();

  // A. LÓGICA DE LA CONSOLA (Órdenes de Franco o Mari)
  if (body.action === 'send_template' || body.action === 'send_message') {
    const { phone_number, content, type, media_url, template_id } = body;
    if (phone_number === 'test_account') return new NextResponse('OK', { status: 200 });

    let finalContent = content;
    let finalType = type || 'text';
    let finalUrl = media_url;

    // Si es un disparador (template), buscamos sus datos
    if (body.action === 'send_template') {
      const { data: t } = await supabase.from('templates').select('*').eq('id', template_id).single();
      if (t) {
        finalContent = t.content;
        finalType = t.type;
        finalUrl = t.type === 'audio' ? t.content : null;
      }
    }

    // Envío real según tipo
    if (finalType === 'audio') {
      await sendNativeAudio(phone_number, finalUrl);
    } else {
      await sendToWhatsApp(phone_number, finalContent);
    }

    // Registro en historial
    await supabase.from('messages').insert({
      phone_number,
      role: 'assistant',
      content: finalType === 'audio' ? `🔊 ${finalContent}` : finalContent,
      message_type: finalType,
      media_url: finalUrl
    });

    return NextResponse.json({ success: true });
  }

  // B. LÓGICA DE MENSAJES ENTRANTES (Webhook de Meta)
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  let text = message.text?.body || "";
  let msgType = 'text';
  let mediaUrl = null;

  // Manejo de Imágenes recibidas
  if (message.type === 'image') {
    msgType = 'image';
    text = "[FOTO RECIBIDA]";
    // Nota: Aquí se requiere una función extra para obtener la URL real de Meta usando el ID de la imagen
    mediaUrl = message.image.id; 
  }

  // Guardado inicial del mensaje del cliente
  await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text, message_type: msgType, media_url: mediaUrl 
  });

  // Filtros de IA y Reglas de Silencio
  const { data: chat } = await supabase.from('chats').select('*').eq('phone_number', from).maybeSingle();
  if (chat?.is_manual || chat?.ai_enabled === false || (chat?.ai_response_count || 0) >= 1) {
    return new NextResponse('OK', { status: 200 });
  }

  // Saludo Inteligente (Día/Noche)
  const now = new Date();
  const horaSantiago = now.getUTCHours() - 3;
  const esDeNoche = horaSantiago < 9 || horaSantiago >= 20;

  if (esDeNoche) {
    const { data: n } = await supabase.from('settings').select('value').eq('key', 'alicia_night_prompt').single();
    const nightText = n?.value || "Franco está descansando. Deja tus ideas aquí.";
    await sendToWhatsApp(from, nightText);
    await supabase.from('chats').update({ ai_response_count: 1 }).eq('phone_number', from);
  } else {
    // Si es de día, intentamos disparar tu "Saludo Inicial" pregrabado
    const { data: s } = await supabase.from('templates').select('id').eq('label', 'Saludo Inicial').single();
    if (s) {
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/webhook`, {
        method: 'POST',
        body: JSON.stringify({ action: 'send_template', phone_number: from, template_id: s.id })
      });
      await supabase.from('chats').update({ ai_response_count: 1 }).eq('phone_number', from);
    }
  }

  return new NextResponse('OK', { status: 200 });
}