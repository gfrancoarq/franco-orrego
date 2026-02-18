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

  // 1. CARGA DE CHATS Y BOTONES
  useEffect(() => {
    const fetchData = async () => {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false }).order('updated_at', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    };
    fetchData();
    // Suscripción en tiempo real para nuevos chats
    const channel = supabase.channel('schema-db-changes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // 2. CARGA DE HISTORIAL AL SELECCIONAR CHAT
  useEffect(() => {
    if (!selectedChat) return;
    const fetchMessages = async () => {
      const { data } = await supabase.from('messages').select('*').eq('phone_number', selectedChat.phone_number).order('created_at', { ascending: true });
      setMessages(data || []);
    };
    fetchMessages();
    // Suscripción para ver mensajes nuevos mientras chateas
    const msgChannel = supabase.channel('msg-realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `phone_number=eq.${selectedChat.phone_number}` }, () => fetchMessages()).subscribe();
    return () => { supabase.removeChannel(msgChannel); };
  }, [selectedChat]);

  // 3. ENVÍO REAL A WHATSAPP
  const executeSend = async (template) => {
    setPendingSend(null);
    // Llamada a tu API de Webhook que configuramos antes
    const res = await fetch('/api/webhook', {
      method: 'POST',
      body: JSON.stringify({
        action: 'send_template',
        phone_number: selectedChat.phone_number,
        template_id: template.id
      })
    });
    if (res.ok) {
      // Registrar en el historial visual inmediatamente
      setMessages([...messages, { role: 'assistant', content: template.type === 'audio' ? `🎤 ${template.label}` : template.content, created_at: new Date() }]);
    }
  };

  const triggerSend = (template) => {
    if (!selectedChat) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingSend(template);
    timerRef.current = setTimeout(() => executeSend(template), 10000); // 10 seg de pánico
  };

  return (
    <div className="flex h-screen bg-[#121212] text-white font-sans overflow-hidden">
      
      {/* SIDEBAR: LISTA DE CHATS */}
      <div className="w-80 border-r border-white/10 flex flex-col bg-[#1a1a1a]">
        <div className="p-6 border-b border-white/10">
          <h1 className="text-xl font-black italic tracking-tighter">FRANCO ORREGO</h1>
          <p className="text-[10px] text-blue-500 font-bold tracking-widest uppercase">Console v2.8</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              onClick={() => setSelectedChat(chat)}
              className={`p-4 border-b border-white/5 cursor-pointer transition-all hover:bg-white/5 ${selectedChat?.id === chat.id ? 'bg-blue-600/20 border-l-4 border-l-blue-600' : ''}`}
            >
              <p className="font-bold text-sm">{chat.phone_number === 'test_account' ? '🛠 CHAT DE PRUEBA' : chat.phone_number}</p>
              <div className="flex gap-2 mt-1">
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${chat.lead_temperature === 'caliente' ? 'bg-red-600' : 'bg-blue-600'}`}>{chat.lead_temperature.toUpperCase()}</span>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded bg-white/10 ${chat.assigned_to === 'Mari' ? 'text-pink-400' : 'text-blue-400'}`}>{chat.assigned_to.toUpperCase()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div className="flex-1 flex flex-col bg-[#0f0f0f]">
        {/* HEADER CHAT */}
        <div className="h-20 border-b border-white/10 flex items-center px-8 justify-between bg-[#1a1a1a]">
          <div>
            <h2 className="font-black text-lg">{selectedChat ? selectedChat.phone_number : "SELECCIONA UN LEAD"}</h2>
            {selectedChat && <p className="text-[10px] text-gray-500 font-bold uppercase">Estado: {selectedChat.lead_temperature}</p>}
          </div>
          {pendingSend && (
            <div className="bg-red-600 px-4 py-2 rounded-lg flex items-center gap-4 animate-pulse">
              <span className="text-xs font-black uppercase">Enviando {pendingSend.label}...</span>
              <button onClick={() => { clearTimeout(timerRef.current); setPendingSend(null); }} className="bg-white text-red-600 text-[10px] font-black px-2 py-1 rounded">ANULAR</button>
            </div>
          )}
        </div>

        {/* MENSAJES HISTORIAL */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-md p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-white/5 self-start border border-white/10' : 'bg-blue-600 self-end font-medium shadow-lg shadow-blue-900/20'}`}>
              {m.content}
            </div>
          ))}
        </div>

        {/* PANEL DISPARADORES */}
        <div className="p-6 bg-[#1a1a1a] border-t border-white/10">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Disparadores de Campaña</span>
            <button onClick={() => setShowModal(true)} className="text-[10px] font-black bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-full transition-colors">+ NUEVO BOTÓN</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {templates.map(t => (
              <button 
                key={t.id} 
                onClick={() => triggerSend(t)}
                className={`p-4 rounded-xl border border-white/10 font-black text-[10px] uppercase tracking-tighter transition-all ${selectedChat ? 'bg-[#252525] hover:border-blue-500 hover:text-blue-500 active:scale-95' : 'opacity-20 cursor-not-allowed'}`}
              >
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL CREACIÓN */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-[#1a1a1a] p-8 rounded-3xl w-full max-w-sm border border-white/10">
            <h2 className="text-xl font-black mb-6 italic uppercase tracking-tighter">Nuevo Disparador</h2>
            <input type="text" placeholder="NOMBRE DEL BOTÓN" className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl mb-4 text-sm font-bold outline-none focus:border-blue-500" onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}/>
            <select className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl mb-4 text-sm font-bold outline-none" onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}>
              <option value="text">TEXTO</option>
              <option value="audio">AUDIO</option>
            </select>
            {newTemplate.type === 'text' && <textarea placeholder="Mensaje..." className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl mb-6 h-32 text-sm outline-none focus:border-blue-500" onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}/>}
            <div className="flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-gray-500 text-xs">CANCELAR</button>
              <button onClick={async () => {
                await supabase.from('templates').insert([newTemplate]);
                const {data} = await supabase.from('templates').select('*');
                setTemplates(data);
                setShowModal(false);
              }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-xl shadow-blue-900/40">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}