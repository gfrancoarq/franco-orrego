'use client';
import { useState, useEffect, useRef } from 'react';
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
  const [pendingSend, setPendingSend] = useState(null);
  const timerRef = useRef(null);

  // CARGA INICIAL DE CHATS Y BOTONES
  useEffect(() => {
    const fetchData = async () => {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    };
    fetchData();
  }, []);

  // CARGA DE MENSAJES AL SELECCIONAR CLIENTE
  useEffect(() => {
    if (!selectedChat) return;
    const fetchMsgs = async () => {
      const { data } = await supabase.from('messages')
        .select('*')
        .eq('phone_number', selectedChat.phone_number)
        .order('created_at', { ascending: true });
      setMessages(data || []);
    };
    fetchMsgs();
    
    // Escuchar mensajes nuevos en tiempo real
    const channel = supabase.channel('realtime-msgs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => fetchMsgs())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedChat]);

  const executeSend = async (template) => {
    setPendingSend(null);
    const res = await fetch('/api/webhook', {
      method: 'POST',
      body: JSON.stringify({ action: 'send_template', phone_number: selectedChat.phone_number, template_id: template.id })
    });
    if (res.ok) alert("Mensaje enviado a WhatsApp");
  };

  const triggerSend = (template) => {
    if (!selectedChat) return;
    setPendingSend(template);
    timerRef.current = setTimeout(() => executeSend(template), 10000);
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans">
      
      {/* LATERAL: LISTA DE CLIENTES */}
      <div className="w-80 border-r border-gray-800 flex flex-col bg-[#0a0a0a]">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-black tracking-tighter italic text-blue-500">FRANCO ORREGO</h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase">Consola de Control</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              onClick={() => setSelectedChat(chat)}
              className={`p-4 border-b border-gray-900 cursor-pointer hover:bg-white/5 ${selectedChat?.id === chat.id ? 'bg-blue-600/10 border-l-4 border-l-blue-600' : ''}`}
            >
              <p className="font-bold text-sm">{chat.phone_number === 'test_account' ? '🛠 CHAT DE TEST' : chat.phone_number}</p>
              <span className="text-[9px] font-black text-gray-500 uppercase">{chat.lead_temperature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA CENTRAL: CHAT Y DISPARADORES */}
      <div className="flex-1 flex flex-col bg-[#050505]">
        
        {/* HEADER */}
        <div className="h-16 border-b border-gray-800 flex items-center px-8 justify-between bg-[#0a0a0a]">
          <span className="font-black text-sm uppercase tracking-widest text-gray-400">
            {selectedChat ? selectedChat.phone_number : "Selecciona un chat"}
          </span>
          {pendingSend && (
            <div className="bg-red-600 px-4 py-1 rounded text-[10px] font-black animate-pulse flex items-center gap-4">
              ENVIANDO {pendingSend.label}... 
              <button onClick={() => { clearTimeout(timerRef.current); setPendingSend(null); }} className="bg-white text-red-600 px-2 rounded">CANCELAR</button>
            </div>
          )}
        </div>

        {/* MENSAJES */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[70%] p-3 rounded-xl text-xs ${m.role === 'user' ? 'bg-gray-900 self-start' : 'bg-blue-600 self-end'}`}>
              {m.content}
            </div>
          ))}
        </div>

        {/* PANEL DE BOTONES */}
        <div className="p-4 bg-[#0a0a0a] border-t border-gray-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest">Disparadores de Campaña</span>
            <button onClick={() => setShowModal(true)} className="text-[9px] bg-white text-black px-3 py-1 rounded-full font-black hover:bg-blue-500 hover:text-white transition-colors">
              + NUEVO BOTÓN
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {templates.map(t => (
              <button 
                key={t.id} 
                onClick={() => triggerSend(t)}
                className={`p-3 rounded-lg border border-gray-800 text-[10px] font-black uppercase transition-all ${selectedChat ? 'bg-[#111] hover:border-blue-600 hover:text-blue-500' : 'opacity-20 cursor-not-allowed'}`}
              >
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL CREAR BOTÓN */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="bg-[#0a0a0a] p-8 rounded-2xl w-full max-w-sm border border-gray-800">
            <h2 className="text-xl font-black italic mb-6">NUEVO BOTÓN</h2>
            <input 
              type="text" 
              placeholder="NOMBRE" 
              className="w-full p-3 bg-white/5 border border-gray-800 rounded mb-4 text-xs font-bold outline-none"
              onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}
            />
            <textarea 
              placeholder="CONTENIDO" 
              className="w-full p-3 bg-white/5 border border-gray-800 rounded mb-6 text-xs font-bold h-24 outline-none"
              onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 font-bold text-gray-500 text-xs">CANCELAR</button>
              <button 
                onClick={async () => {
                  await supabase.from('templates').insert([newTemplate]);
                  setShowModal(false);
                  window.location.reload();
                }}
                className="flex-1 py-3 bg-blue-600 text-white font-black text-xs rounded shadow-lg shadow-blue-900/50"
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