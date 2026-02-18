'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../globals.css';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function ConsolaVentas() {
  // --- ESTADOS ---
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [inputText, setInputText] = useState("");
  const [fullScreenImage, setFullScreenImage] = useState(null);
  
  // Estados para Modal y Nuevo Disparador
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: '', type: 'text', content: '' });

  // --- CARGA DE DATOS Y TIEMPO REAL ---
  useEffect(() => {
    const fetchData = async () => {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    };
    fetchData();

    // Suscripción a mensajes nuevos para ver el historial en vivo
    const channel = supabase.channel('realtime-consola').on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'messages' }, 
      (payload) => {
        if (selectedChat && payload.new.phone_number === selectedChat.phone_number) {
          setMessages(prev => [...prev, payload.new]);
        }
      }
    ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedChat]);

  const loadHistory = async (chat) => {
    setSelectedChat(chat);
    const { data } = await supabase.from('messages')
      .select('*')
      .eq('phone_number', chat.phone_number)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  // --- ACCIONES DE ENVÍO ---
  const handleManualSend = async () => {
    if (!inputText || !selectedChat) return;
    await fetch('/api/webhook', {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'send_message', 
        phone_number: selectedChat.phone_number, 
        content: inputText, 
        type: 'text' 
      })
    });
    setInputText("");
  };

  const handleTemplateSend = async (t) => {
    if (!selectedChat) return;
    await fetch('/api/webhook', {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'send_template', 
        phone_number: selectedChat.phone_number, 
        template_id: t.id 
      })
    });
  };

  const saveTemplate = async () => {
    if (!newTemplate.label || !newTemplate.content) return;
    const { error } = await supabase.from('templates').insert([newTemplate]);
    if (!error) {
      setShowModal(false);
      window.location.reload();
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans overflow-hidden">
      
      {/* 1. SIDEBAR: LISTA DE CHATS */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-black">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-black italic text-white">FRANCO ORREGO</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Console v3.1</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              onClick={() => loadHistory(chat)} 
              className={`p-4 border-b border-zinc-900 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : 'hover:bg-zinc-900'}`}
            >
              <div className="flex justify-between items-center">
                <p className="font-bold text-sm">{chat.phone_number === 'test_account' ? '🛠 TEST' : chat.phone_number}</p>
                <div className={`w-2 h-2 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500 shadow-[0_0_10px_rgba(219,39,119,0.5)]' : 'bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.5)]'}`}></div>
              </div>
              <p className="text-[9px] font-black uppercase text-zinc-500 mt-1">{chat.lead_temperature}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 2. ÁREA DE CHAT PRINCIPAL */}
      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-900/50 justify-between">
          <span className="font-bold text-xs uppercase tracking-widest text-zinc-400">
            {selectedChat ? `Cliente: ${selectedChat.phone_number}` : "Selecciona un chat"}
          </span>
        </div>

        {/* HISTORIAL DE MENSAJES CON SOPORTE PARA FOTOS */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-black">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[70%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-zinc-800 self-start text-zinc-200' : 'bg-blue-600 self-end font-medium text-white shadow-lg'}`}>
              {m.message_type === 'image' ? (
                <div className="flex flex-col gap-2">
                  <img 
                    src={m.media_url || 'https://via.placeholder.com/150?text=FOTO+RECIBIDA'} 
                    alt="Tattoo Ref"
                    className="rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity w-48 h-auto"
                    onClick={() => setFullScreenImage(m.media_url)}
                  />
                  <span className="text-[9px] opacity-50 uppercase font-black text-center">Click para ampliar</span>
                </div>
              ) : (
                m.content
              )}
            </div>
          ))}
        </div>

        {/* BARRA DE TEXTO MANUAL */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex gap-2">
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSend()}
            placeholder="Escribe un mensaje manual..." 
            className="flex-1 bg-black border border-zinc-800 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 text-white"
          />
          <button onClick={handleManualSend} className="bg-blue-600 px-6 py-2 rounded-xl font-bold text-xs uppercase hover:bg-blue-700 transition-colors">Enviar</button>
        </div>

        {/* PANEL DE DISPARADORES */}
        <div className="p-6 bg-black border-t border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Disparadores Activos</span>
            <button onClick={() => setShowModal(true)} className="text-[10px] font-black bg-white text-black px-4 py-1.5 rounded-full hover:bg-blue-600 hover:text-white transition-all">+ NUEVO BOTÓN</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button 
                key={t.id} 
                onClick={() => handleTemplateSend(t)} 
                className={`px-4 py-2 rounded-xl border border-zinc-800 text-xs font-bold transition-all ${selectedChat ? 'bg-zinc-900 text-white hover:border-blue-500 hover:text-blue-500' : 'opacity-20 cursor-not-allowed'}`}
              >
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. MODAL DE CREACIÓN DE DISPARADORES */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[150] backdrop-blur-sm">
          <div className="bg-[#0a0a0a] p-8 rounded-3xl w-full max-w-sm border border-zinc-800">
            <h2 className="text-xl font-black italic mb-6 uppercase tracking-tighter">Nuevo Disparador</h2>
            
            <label className="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Nombre del Botón</label>
            <input 
              type="text" 
              placeholder="Ej: Saludo Manga" 
              className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white outline-none focus:border-blue-500" 
              onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}
            />
            
            <label className="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Tipo de Mensaje</label>
            <select 
              className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white outline-none focus:border-blue-500"
              value={newTemplate.type}
              onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}
            >
              <option value="text">Texto (💬)</option>
              <option value="audio">Audio / Nota de voz (🔊)</option>
            </select>

            <label className="text-[9px] font-black text-zinc-500 uppercase ml-2 mb-1 block">Contenido / Link Audio</label>
            <textarea 
              placeholder="Escribe el texto o pega el link del audio de Supabase..." 
              className="w-full p-4 bg-zinc-900 border border-zinc-800 rounded-2xl mb-6 h-24 text-sm font-medium text-zinc-300 outline-none focus:border-blue-500" 
              onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
            />
            
            <div className="flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-zinc-500 text-xs uppercase">Cerrar</button>
              <button 
                onClick={saveTemplate} 
                className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl hover:bg-blue-700 transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL DE ZOOM PARA FOTOS */}
      {fullScreenImage && (
        <div 
          className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setFullScreenImage(null)}
        >
          <img 
            src={fullScreenImage} 
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border border-white/10 animate-in fade-in zoom-in duration-300"
            alt="Full view"
          />
          <button className="absolute top-10 right-10 bg-white/10 hover:bg-white/20 text-white w-12 h-12 rounded-full font-black">X</button>
        </div>
      )}
    </div>
  );
}