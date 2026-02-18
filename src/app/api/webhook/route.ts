import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Groq from "groq-sdk";
import { ALICIA_PROMPT } from './prompt';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

// --- UTILIDADES DE ENVÍO (Llamada directa a Meta) ---
async function sendToWhatsApp(to: string, content: any) {
  await fetch(`https://graph.facebook.com/v22.0/${process.env.META_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${process.env.META_TOKEN}`, 
      'Content-Type': 'application/json' 
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...content }),
  });
}

// --- WEBHOOK PRINCIPAL ---
export async function POST(req: Request) {
  const body = await req.json();

  // 1. LÓGICA DE CONSOLA (Franco/Mari enviando mensajes o disparadores)
  if (body.action === 'send_template' || body.action === 'send_message') {
    const { phone_number, content, type, template_id } = body;
    let finalContent = content;
    let finalType = type || 'text';

    if (body.action === 'send_template') {
      const { data: t } = await supabase.from('templates').select('*').eq('id', template_id).single();
      if (t) { 
        finalContent = t.content; 
        finalType = t.type; 
      }
    }

    const payload = finalType === 'audio' 
      ? { type: 'audio', audio: { link: finalContent } }
      : { type: 'text', text: { body: finalContent } };

    await sendToWhatsApp(phone_number, payload);
    
    await supabase.from('messages').insert({ 
      phone_number, 
      role: 'assistant', 
      content: finalContent, 
      message_type: finalType 
    });

    return NextResponse.json({ success: true });
  }

  // 2. LÓGICA DE CLIENTE (Mensajes entrantes por Webhook)
  const entry = body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];
  if (!message) return new NextResponse('OK', { status: 200 });

  const from = message.from;
  const text = message.text?.body || "";
  const isImage = message.type === 'image';

  // Guardamos lo que envía el cliente
  await supabase.from('messages').insert({ 
    phone_number: from, 
    role: 'user', 
    content: isImage ? "[IMAGEN]" : text, 
    message_type: isImage ? 'image' : 'text',
    media_url: isImage ? message.image.id : null 
  });

  // Filtros de IA y Control Manual
  const { data: chat } = await supabase.from('chats').select('*').eq('phone_number', from).maybeSingle();
  if (chat?.is_manual || chat?.ai_enabled === false || (chat?.ai_response_count || 0) >= 1) {
    return new NextResponse('OK', { status: 200 });
  }

  // Lógica Alicia (Noche/Día en Santiago)
  const horaSantiago = new Date().getUTCHours() - 3;
  const esDeNoche = horaSantiago < 9 || horaSantiago >= 20;

  if (esDeNoche) {
    // RESPUESTA NOCTURNA
    const { data: n } = await supabase.from('settings').select('value').eq('key', 'alicia_night_prompt').single();
    const nightText = n?.value || "Hola! Franco está descansando. Deja tus ideas aquí.";
    
    await sendToWhatsApp(from, { text: { body: nightText } });
    await supabase.from('messages').insert({ 
      phone_number: from, role: 'assistant', content: nightText, message_type: 'text' 
    });
  } else {
    // SALUDO DE DÍA: Disparo directo del audio/texto "Saludo Inicial"
    const { data: s } = await supabase.from('templates').select('*').eq('label', 'Saludo Inicial').single();
    if (s) {
      const payload = s.type === 'audio' 
        ? { type: 'audio', audio: { link: s.content } }
        : { type: 'text', text: { body: s.content } };
        
      await sendToWhatsApp(from, payload);
      await supabase.from('messages').insert({ 
        phone_number: from, role: 'assistant', content: s.content, message_type: s.type 
      });
    }
  }

  // Marcamos que Alicia ya intervino para que se calle
  await supabase.from('chats').update({ ai_response_count: 1 }).eq('phone_number', from);
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