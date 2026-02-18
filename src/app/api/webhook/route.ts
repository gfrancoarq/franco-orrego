import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { ALICIA_PROMPT } from './prompt';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// --- UTILIDADES DE ENVÍO (Llamada limpia a Meta) ---
async function sendToWhatsApp(to: string, content: any) {
  const response = await fetch(`https://graph.facebook.com/v22.0/${process.env.META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${process.env.META_TOKEN}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...content }),
  });

  const result = await response.json();
  
  if (!response.ok) {
    console.error("ERROR DE META:", result);
    // Registramos el error en la tabla para que sepas qué pasó
    await supabase.from('messages').insert({ 
      phone_number: to, 
      role: 'system', 
      content: `⚠️ ERROR META: ${result.error?.message || 'Revisa configuración'}` 
    });
  }
}

// --- WEBHOOK PRINCIPAL ---
export async function POST(req: Request) {
  const body = await req.json();

  // A. LÓGICA DE CONSOLA (Franco/Mari enviando)
  if (body.action === 'send_template' || body.action === 'send_message') {
    const { phone_number, content, type, template_id } = body;
    if (phone_number === 'test_account') return NextResponse.json({ success: true });

    let finalContent = content;
    let finalType = type || 'text';

    if (body.action === 'send_template') {
      const { data: t } = await supabase.from('templates').select('*').eq('id', template_id).single();
      if (t) { finalContent = t.content; finalType = t.type; }
    }

    const payload = finalType === 'audio' 
      ? { type: 'audio', audio: { link: finalContent } }
      : { type: 'text', text: { body: finalContent } };

    await sendToWhatsApp(phone_number, payload);
    
    // Guardamos en Supabase
    await supabase.from('messages').insert({ 
      phone_number, 
      role: 'assistant', 
      content: finalContent, 
      message_type: finalType 
    });

    return NextResponse.json({ success: true });
  }

  // B. LÓGICA DE CLIENTE (Mensaje entrante)
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const isImage = message.type === 'image';

  await supabase.from('messages').insert({ 
    phone_number: from, 
    role: 'user', 
    content: isImage ? "[IMAGEN]" : text, 
    message_type: isImage ? 'image' : 'text'
  });

  // Filtros de IA
  const { data: chat } = await supabase.from('chats').select('*').eq('phone_number', from).maybeSingle();
  if (chat?.is_manual || chat?.ai_enabled === false || (chat?.ai_response_count || 0) >= 1) {
    return new NextResponse('OK', { status: 200 });
  }

  // Lógica Alicia (Día/Noche)
  const horaSantiago = new Date().getUTCHours() - 3;
  if (horaSantiago < 9 || horaSantiago >= 20) {
    const { data: n } = await supabase.from('settings').select('value').eq('key', 'alicia_night_prompt').single();
    await sendToWhatsApp(from, { text: { body: n?.value || "Alicia aquí. Franco te responderá pronto!" } });
  } else {
    const { data: s } = await supabase.from('templates').select('*').eq('label', 'Saludo Inicial').single();
    if (s) {
      const payload = s.type === 'audio' ? { type: 'audio', audio: { link: s.content } } : { type: 'text', text: { body: s.content } };
      await sendToWhatsApp(from, payload);
    }
  }

  await supabase.from('chats').update({ ai_response_count: 1 }).eq('phone_number', from);
  return new NextResponse('OK', { status: 200 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}