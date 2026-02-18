'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../globals.css';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function ConsolaVentas() {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: '', type: 'text', content: '' });

  // 1. Cargar Chats y Botones
  useEffect(() => {
    const fetchData = async () => {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    };
    fetchData();
  }, []);

  // 2. Cargar Historial al seleccionar (con limpieza de estado previa)
  const selectChat = async (chat) => {
    setSelectedChat(chat);
    setMessages([]); // Limpiamos para evitar ver mensajes del cliente anterior
    const { data } = await supabase.from('messages')
      .select('*')
      .eq('phone_number', chat.phone_number)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  // 3. Función de Envío Real
  const sendTrigger = async (template) => {
    if (!selectedChat) return;
    
    // Disparamos la API de Vercel
    const res = await fetch('/api/webhook', {
      method: 'POST',
      body: JSON.stringify({
        action: 'send_template',
        phone_number: selectedChat.phone_number,
        template_id: template.id
      })
    });

    if (res.ok) {
      alert(`Enviando "${template.label}" a WhatsApp...`);
      // Refrescamos mensajes localmente
      const { data } = await supabase.from('messages')
        .select('*')
        .eq('phone_number', selectedChat.phone_number)
        .order('created_at', { ascending: true });
      setMessages(data || []);
    }
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#0a0a0a]">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-2xl font-black italic tracking-tighter text-white">FRANCO ORREGO</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Console v3.0</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              onClick={() => selectChat(chat)}
              className={`p-4 border-b border-zinc-900 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : 'hover:bg-zinc-900'}`}
            >
              <div className="flex justify-between items-center">
                <p className={`font-bold text-sm ${selectedChat?.id === chat.id ? 'text-white' : 'text-zinc-400'}`}>
                  {chat.phone_number === 'test_account' ? '🛠 CHAT DE TEST' : chat.phone_number}
                </p>
                {/* Punto de color por asignación */}
                <div className={`w-2 h-2 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500 shadow-[0_0_10px_rgba(219,39,119,0.5)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.5)]'}`}></div>
              </div>
              <span className={`text-[9px] font-black uppercase ${chat.lead_temperature === 'caliente' ? 'text-red-500' : 'text-zinc-600'}`}>
                {chat.lead_temperature}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col bg-black">
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 bg-[#0a0a0a]">
          <span className="font-bold text-xs uppercase tracking-widest text-zinc-500">
            {selectedChat ? `Cliente: ${selectedChat.phone_number}` : "Selecciona un lead para operar"}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 bg-[#050505]">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[70%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-zinc-900 text-zinc-200 self-start border border-zinc-800' : 'bg-blue-600 text-white self-end font-medium shadow-lg'}`}>
              {m.content}
            </div>
          ))}
          {selectedChat && messages.length === 0 && (
            <div className="m-auto text-zinc-700 text-[10px] font-bold uppercase tracking-widest">Sin historial de mensajes</div>
          )}
        </div>

        {/* PANEL DISPARADORES */}
        <div className="p-6 bg-[#0a0a0a] border-t border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Disparadores Activos</span>
            <button onClick={() => setShowModal(true)} className="text-[10px] font-black bg-white text-black px-4 py-1.5 rounded-full hover:bg-blue-600 hover:text-white transition-all">+ NUEVO</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button 
                key={t.id} 
                onClick={() => sendTrigger(t)}
                className={`px-5 py-2.5 rounded-xl border font-bold text-xs transition-all ${selectedChat ? 'bg-zinc-900 border-zinc-700 text-white hover:border-blue-500 hover:text-blue-500 active:scale-95' : 'opacity-20 cursor-not-allowed'}`}
              >
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-[#0a0a0a] p-8 rounded-3xl w-full max-w-sm border border-zinc-800">
            <h2 className="text-xl font-black italic mb-6 uppercase tracking-tighter">Crear Botón</h2>
            <input type="text" placeholder="Nombre (Ej: Saludo)" className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white outline-none focus:border-blue-500" onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}/>
            <textarea placeholder="Contenido del mensaje..." className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-2xl mb-6 h-32 text-sm font-medium text-zinc-300 outline-none focus:border-blue-500" onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}/>
            <div className="flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-zinc-500 text-xs">CERRAR</button>
              <button 
                onClick={async () => {
                  await supabase.from('templates').insert([newTemplate]);
                  setShowModal(false);
                  window.location.reload();
                }}
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl"
              >
                GUARDAR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}