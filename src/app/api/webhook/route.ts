import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { ALICIA_PROMPT } from './prompt';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// --- UTILIDADES DE ENVÍO (URL CORREGIDA) ---
async function sendToWhatsApp(to: string, content: any) {
  // Eliminamos la versión v22.0 y usamos la ruta base que Meta recomienda en su consola
  const url = `https://graph.facebook.com/v18.0/${process.env.META_PHONE_ID}/messages`;
  
  const response = await fetch(url, {
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
    // Guardamos el error exacto para que lo veas en la consola visual
    await supabase.from('messages').insert({ 
      phone_number: to, 
      role: 'system', 
      content: `⚠️ META INFO: ${result.error?.message || 'Error de entrega'}` 
    });
  }
}

// --- WEBHOOK PRINCIPAL (POST) ---
export async function POST(req: Request) {
  const body = await req.json();

  // ACCIÓN DESDE LA CONSOLA
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
    
    await supabase.from('messages').insert({ 
      phone_number, role: 'assistant', content: finalContent, message_type: finalType 
    });

    return NextResponse.json({ success: true });
  }

  // LÓGICA DE MENSAJE ENTRANTE (WEBHOOK)
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  
  await supabase.from('messages').insert({ 
    phone_number: from, role: 'user', content: text, message_type: 'text'
  });

  return new NextResponse('OK', { status: 200 });
}

// --- VERIFICACIÓN DE WEBHOOK (GET) ---
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('hub.verify_token') === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(searchParams.get('hub.challenge'), { status: 200 });
  }
  return new NextResponse('Forbidden', { status: 403 });
}