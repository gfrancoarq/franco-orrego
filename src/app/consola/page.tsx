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

  useEffect(() => {
    const fetchData = async () => {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (!selectedChat) return;
    const fetchMsgs = async () => {
      const { data } = await supabase.from('messages').select('*').eq('phone_number', selectedChat.phone_number).order('created_at', { ascending: true });
      setMessages(data || []);
    };
    fetchMsgs();
  }, [selectedChat]);

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* LATERAL IZQUIERDO */}
      <div className="w-72 border-r border-zinc-800 flex flex-col bg-[#0a0a0a]">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-black italic text-white">FRANCO ORREGO</h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Console v2.9</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => (
            <div 
              key={chat.id} 
              onClick={() => setSelectedChat(chat)}
              className={`p-4 border-b border-zinc-900 cursor-pointer hover:bg-zinc-800 ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : ''}`}
            >
              <p className="font-bold text-sm text-white">{chat.phone_number === 'test_account' ? '🛠 CHAT DE TEST' : chat.phone_number}</p>
              <span className="text-[9px] font-black text-zinc-500 uppercase">{chat.lead_temperature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ÁREA CENTRAL */}
      <div className="flex-1 flex flex-col bg-black">
        {/* HEADER */}
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 bg-[#0a0a0a]">
          <span className="font-bold text-sm text-zinc-400">
            {selectedChat ? `CLIENTE: ${selectedChat.phone_number}` : "SELECCIONA UN CHAT"}
          </span>
        </div>

        {/* MENSAJES (Burbujas claras sobre fondo oscuro) */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3 bg-[#050505]">
          {messages.length === 0 && <p className="text-zinc-600 text-center mt-10 text-xs">No hay mensajes en este chat.</p>}
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[75%] p-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-zinc-800 text-white self-start' : 'bg-blue-600 text-white self-end font-bold'}`}>
              {m.content}
            </div>
          ))}
        </div>

        {/* DISPARADORES */}
        <div className="p-6 bg-[#0a0a0a] border-t border-zinc-800">
          <p className="text-[10px] font-black text-zinc-600 uppercase mb-4 tracking-widest">Disparadores de Campaña</p>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button 
                key={t.id} 
                className="bg-zinc-900 border border-zinc-700 px-4 py-2 rounded-xl text-xs font-bold text-white hover:border-blue-500 hover:text-blue-500 transition-all"
              >
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
            <button className="border-2 border-dashed border-zinc-800 px-4 py-2 rounded-xl text-zinc-600 text-xs font-bold">
              + NUEVO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}