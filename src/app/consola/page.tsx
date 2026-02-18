'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../globals.css';

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
  const [currentTime, setCurrentTime] = useState(new Date());

  const messagesEndRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getChatStatus = (lastMessageAt) => {
    if (!lastMessageAt) return { color: 'text-zinc-600', label: 'Sin actividad', hoursLeft: 24, alert: false };
    const diffHours = (currentTime - new Date(lastMessageAt)) / (1000 * 60 * 60);
    const hoursLeft = Math.max(0, 24 - diffHours);

    if (diffHours >= 24) return { color: 'bg-zinc-900 text-zinc-600', label: 'VENTANA CERRADA', hoursLeft: 0, alert: false };
    if (diffHours >= 20) return { color: 'bg-red-600 text-white animate-pulse', label: `URGENTE: ${hoursLeft.toFixed(1)}h`, hoursLeft, alert: true };
    if (diffHours >= 16) return { color: 'bg-orange-600 text-white', label: `ALERTA: ${hoursLeft.toFixed(1)}h`, hoursLeft, alert: true };
    return { color: 'bg-zinc-800 text-zinc-400', label: `Plazo: ${hoursLeft.toFixed(1)}h`, hoursLeft, alert: false };
  };

  const fetchData = async () => {
    if (!supabase) return;
    const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
    const { data: t } = await supabase.from('templates').select('*');
    setChats(c || []);
    setTemplates(t || []);
  };

  useEffect(() => {
    fetchData();
    if (supabase) {
      const sub = supabase.channel('any').on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => fetchData()).subscribe();
      return () => { supabase.removeChannel(sub); };
    }
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const loadHistory = async (chat) => {
    setSelectedChat(chat);
    if (!supabase) return;
    const { data } = await supabase.from('messages').select('*').eq('phone_number', chat.phone_number).order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const handleManualSend = async () => {
    if (!inputText || !selectedChat) return;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const diffHours = lastUserMsg ? (new Date() - new Date(lastUserMsg.created_at)) / (1000 * 60 * 60) : 0;

    if (diffHours >= 24) {
      const cleanPhone = selectedChat.phone_number.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(inputText)}`, '_blank');
      setInputText("");
      return;
    }

    const tempMsg = { role: 'assistant', content: inputText, created_at: new Date().toISOString(), message_type: 'text' };
    setMessages([...messages, tempMsg]);
    const textToSend = inputText;
    setInputText("");

    await fetch('/api/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send_message', phone_number: selectedChat.phone_number, content: textToSend, type: 'text' })
    });
  };

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#050505]">
        <div className="p-6 border-b border-zinc-800"><h1 className="text-xl font-black italic text-blue-500">FRANCO ORREGO</h1></div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => {
            const status = getChatStatus(chat.last_message_at);
            return (
              <div key={chat.id} onClick={() => loadHistory(chat)} className={`p-4 border-b border-zinc-900 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : 'hover:bg-zinc-900'} ${status.alert ? status.color : ''}`}>
                <div className="flex justify-between items-center"><p className="font-bold text-sm">{chat.phone_number}</p></div>
                <p className="text-[8px] font-black uppercase mt-2">{status.label}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex-1 flex flex-col bg-[#0a0a0a]">
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 justify-between bg-zinc-900/40">
          <span className="font-bold text-[10px] uppercase text-zinc-500">{selectedChat ? `Operando: ${selectedChat.phone_number}` : "Selecciona un chat"}</span>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-black">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[75%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-zinc-800 text-zinc-200 self-start border border-zinc-700' : 'bg-blue-600 text-white self-end font-bold shadow-xl'}`}>
              {m.message_type === 'image' ? <img src={m.media_url} className="rounded-lg w-56" /> : m.content}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex gap-3">
          <input value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleManualSend()} className="flex-1 bg-black border border-zinc-800 rounded-2xl px-6 py-3 text-sm text-white outline-none" placeholder="Escribe un mensaje..." />
          <button onClick={handleManualSend} className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest ${getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? 'bg-green-600' : 'bg-blue-600'}`}>
            {getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? 'Abrir WA Web' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}