'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../globals.css';

// Usamos valores por defecto para evitar que el build o la carga fallen
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default function ConsolaVentas() {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [inputText, setInputText] = useState("");
  const [fullScreenImage, setFullScreenImage] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: '', type: 'text', content: '' });

  // 1. CARGA INICIAL: Forzamos la carga incluso con errores
  const fetchData = async () => {
    if (!supabase) return;
    try {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  useEffect(() => {
    fetchData();
    // Suscripción Realtime para chats nuevos
    if (supabase) {
      const chatSub = supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchData()).subscribe();
      return () => { supabase.removeChannel(chatSub); };
    }
  }, []);

  // 2. CARGA DE HISTORIAL: Garantizamos que se llame al seleccionar
  const loadHistory = async (chat) => {
    setSelectedChat(chat);
    if (!supabase) return;
    const { data } = await supabase.from('messages')
      .select('*')
      .eq('phone_number', chat.phone_number)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  // 3. GUARDADO DE DISPARADOR: Corregido para que no falle el botón
  const saveTemplate = async () => {
    if (!newTemplate.label || !newTemplate.content || !supabase) {
      alert("Faltan datos o conexión");
      return;
    }
    const { error } = await supabase.from('templates').insert([newTemplate]);
    if (error) {
      alert("Error al guardar: " + error.message);
    } else {
      setShowModal(false);
      setNewTemplate({ label: '', type: 'text', content: '' });
      fetchData(); // Refrescar lista sin recargar página
    }
  };

const handleManualSend = async () => {
  if (!inputText || !selectedChat) return;

  // 1. CREAMOS EL MENSAJE "FANTASMA" (Aparece de inmediato)
  const tempMsg = {
    role: 'assistant',
    content: inputText,
    created_at: new Date().toISOString(),
    message_type: 'text'
  };
  
  // Lo inyectamos al estado para que lo veas al instante
  setMessages([...messages, tempMsg]);
  const textToSend = inputText;
  setInputText(""); // Limpiamos el input rápido

  // 2. HACEMOS EL ENVÍO REAL POR DETRÁS
  try {
    await fetch('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'send_message', 
        phone_number: selectedChat.phone_number, 
        content: textToSend, 
        type: 'text' 
      })
    });
  } catch (err) {
    console.error("Error al enviar:", err);
    alert("No se pudo enviar el mensaje, revisa tu conexión.");
  }
};

  if (!supabase) return <div className="p-20 text-white bg-black h-screen text-center font-black uppercase">Faltan Variables de Entorno en Vercel</div>;

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#050505]">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-black italic text-blue-500">FRANCO ORREGO</h1>
          <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Console v3.2</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && <p className="p-10 text-center text-zinc-700 text-xs font-bold uppercase italic">Cargando chats...</p>}
          {chats.map(chat => (
            <div key={chat.id} onClick={() => loadHistory(chat)} className={`p-4 border-b border-zinc-900 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : 'hover:bg-zinc-900'}`}>
              <div className="flex justify-between items-center">
                <p className="font-bold text-sm text-zinc-200">{chat.phone_number === 'test_account' ? '🛠 TEST' : chat.phone_number}</p>
                <div className={`w-2 h-2 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
              </div>
              <p className="text-[9px] font-black uppercase text-zinc-600 mt-1">{chat.lead_temperature}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-900/30">
          <span className="font-bold text-[10px] uppercase tracking-widest text-zinc-500">
            {selectedChat ? `Operando: ${selectedChat.phone_number}` : "Selecciona un cliente"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-black">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[75%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-zinc-800 self-start text-zinc-200' : 'bg-blue-600 self-end font-bold shadow-lg'}`}>
              {m.message_type === 'image' ? (
                <img src={m.media_url} alt="Ref" className="rounded-lg w-48 cursor-pointer" onClick={() => setFullScreenImage(m.media_url)}/>
              ) : m.content}
            </div>
          ))}
        </div>

        {/* INPUT MANUAL */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex gap-2">
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSend()}
            placeholder="Escribe un mensaje..." 
            className="flex-1 bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500"
          />
          <button onClick={handleManualSend} className="bg-blue-600 px-6 py-2 rounded-xl font-bold text-xs uppercase">Enviar</button>
        </div>

        {/* DISPARADORES */}
        <div className="p-4 bg-black border-t border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-black text-zinc-700 uppercase">Campañas</span>
            <button onClick={() => setShowModal(true)} className="text-[9px] font-black bg-white text-black px-4 py-1.5 rounded-full">+ NUEVO</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button key={t.id} onClick={() => fetch('/api/webhook', { method: 'POST', body: JSON.stringify({ action: 'send_template', phone_number: selectedChat.phone_number, template_id: t.id }) })} className="bg-zinc-900 border border-zinc-800 px-4 py-2 rounded-lg text-xs font-bold hover:border-blue-500">
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL CORREGIDO */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-[200]">
          <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-sm border border-zinc-800 shadow-2xl">
            <h2 className="text-xl font-black italic mb-6 uppercase tracking-tighter">Nuevo Disparador</h2>
            <input 
              type="text" 
              placeholder="Nombre del Botón" 
              className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white" 
              onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}
            />
            <select 
              className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white"
              onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}
            >
              <option value="text">Texto</option>
              <option value="audio">Audio</option>
            </select>
            <textarea 
              placeholder="Contenido..." 
              className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-6 h-24 text-sm font-medium" 
              onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
            />
            <div className="flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-zinc-500 text-xs">CERRAR</button>
              <button onClick={saveTemplate} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl">GUARDAR</button>
            </div>
          </div>
        </div>
      )}

      {/* ZOOM FOTO */}
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black/95 z-[300] flex items-center justify-center" onClick={() => setFullScreenImage(null)}>
          <img src={fullScreenImage} className="max-w-full max-h-full p-10 object-contain" alt="Zoom"/>
        </div>
      )}
    </div>
  );
}