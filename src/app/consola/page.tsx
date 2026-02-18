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

  // --- LÓGICA DE ALARMAS Y TIEMPO ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000); // Actualiza cada minuto
    return () => clearInterval(timer);
  }, []);

  const getChatStatus = (lastMessageAt) => {
    if (!lastMessageAt) return { color: 'text-zinc-600', label: 'Sin actividad', hoursLeft: 24, alert: false };
    
    const diffHours = (currentTime - new Date(lastMessageAt)) / (1000 * 60 * 60);
    const hoursLeft = Math.max(0, 24 - diffHours);

    if (diffHours >= 24) return { color: 'bg-zinc-900 text-zinc-600', label: 'VENTANA CERRADA', hoursLeft: 0, alert: false };
    if (diffHours >= 20) return { color: 'bg-red-600 text-white animate-pulse shadow-[0_0_15px_red]', label: `¡URGENTE! ${hoursLeft.toFixed(1)}h`, hoursLeft, alert: true };
    if (diffHours >= 16) return { color: 'bg-orange-600 text-white shadow-[0_0_10px_orange]', label: `ALERTA: ${hoursLeft.toFixed(1)}h`, hoursLeft, alert: true };
    
    return { color: 'bg-zinc-800 text-zinc-400', label: `Plazo: ${hoursLeft.toFixed(1)}h`, hoursLeft, alert: false };
  };

  // --- CARGA DE DATOS ---
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

  // --- ENVÍO INTELIGENTE (PUENTE WA WEB) ---
  const handleManualSend = async () => {
    if (!inputText || !selectedChat) return;

    // Buscamos el último mensaje del CLIENTE para validar la ventana
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const diffHours = lastUserMsg ? (new Date() - new Date(lastUserMsg.created_at)) / (1000 * 60 * 60) : 0;

    if (diffHours >= 24) {
      const cleanPhone = selectedChat.phone_number.replace(/\D/g, '');
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(inputText)}`;
      window.open(url, '_blank');
      setInputText("");
      return;
    }

    // Envío normal API
    const tempMsg = { role: 'assistant', content: inputText, created_at: new Date().toISOString(), message_type: 'text' };
    setMessages([...messages, tempMsg]);
    const textToSend = inputText;
    setInputText("");

    try {
      await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_message', phone_number: selectedChat.phone_number, content: textToSend, type: 'text' })
      });
    } catch (err) { alert("Error al enviar."); }
  };

  if (!supabase) return <div className="p-20 text-white bg-black h-screen text-center font-black">Faltan Variables</div>;

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* SIDEBAR CON ALARMAS ROJAS/NARANJAS */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#050505]">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
          <h1 className="text-xl font-black italic text-blue-500">FRANCO ORREGO</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => {
            const status = getChatStatus(chat.last_message_at);
            return (
              <div 
                key={chat.id} 
                onClick={() => loadHistory(chat)} 
                className={`p-4 border-b border-zinc-900 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : 'hover:bg-zinc-900'} ${status.alert ? status.color : ''}`}
              >
                <div className="flex justify-between items-center">
                  <p className={`font-bold text-sm ${status.alert ? 'text-white' : 'text-zinc-200'}`}>{chat.phone_number}</p>
                  <div className={`w-2 h-2 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500 shadow-[0_0_8px_pink]' : 'bg-blue-500 shadow-[0_0_8px_cyan]'}`}></div>
                </div>
                <div className="mt-2 flex justify-between items-center">
                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${status.alert ? 'bg-black/20' : 'bg-zinc-900 text-zinc-500'}`}>
                    {status.label}
                  </span>
                  <span className="text-[8px] font-bold opacity-50 italic">{chat.lead_temperature}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ÁREA DE CHAT */}
      <div className="flex-1 flex flex-col bg-[#0a0a0a]">
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 justify-between bg-zinc-900/40 backdrop-blur-md">
          <span className="font-bold text-[10px] uppercase tracking-widest text-zinc-500">
            {selectedChat ? `Cliente: ${selectedChat.phone_number}` : "Selecciona un chat"}
          </span>
          {selectedChat && (
            <div className={`text-[9px] font-black px-4 py-1.5 rounded-full border ${getChatStatus(selectedChat.last_message_at).alert ? 'border-red-500 text-red-500 animate-pulse' : 'border-zinc-700 text-zinc-500'}`}>
              ESTADO VENTANA: {getChatStatus(selectedChat.last_message_at).label}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-black">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[75%] p-4 rounded-2xl text-sm ${m.role === 'user' ? 'bg-zinc-800 text-zinc-200 self-start border border-zinc-700' : 'bg-blue-600 text-white self-end font-bold shadow-xl'}`}>
              {m.message_type === 'image' ? (
                <img src={m.media_url} alt="Ref" className="rounded-lg w-56 cursor-pointer" onClick={() => setFullScreenImage(m.media_url)}/>
              ) : m.content}
              <p className="text-[8px] mt-1 opacity-30 text-right">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT MANUAL CON BOTÓN DINÁMICO */}
        <div className="p-4 bg-zinc-900 border-t border-zinc-800 flex gap-3">
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSend()}
            placeholder={getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? "⚠️ Ventana cerrada. Se abrirá WA Web..." : "Escribe un mensaje..."}
            className="flex-1 bg-black border border-zinc-800 rounded-2xl px-6 py-3 text-sm outline-none focus:border-blue-500 text-white"
          />
          <button 
            onClick={handleManualSend} 
            className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? 'bg-green-600' : 'bg-blue-600'}`}
          >
            {getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? 'Abrir WA Web' : 'Enviar'}
          </button>
        </div>
      </div>

      {/* MODAL DISPARADOR */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[200]">
          <div className="bg-zinc-900 p-8 rounded-3xl w-full max-w-sm border border-zinc-800">
            <h2 className="text-xl font-black italic mb-6">NUEVO DISPARADOR</h2>
            <input type="text" placeholder="Etiqueta" className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white outline-none" onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}/>
            <textarea placeholder="Mensaje..." className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-6 h-24 text-sm font-medium outline-none" onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}/>
            <div className="flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-bold text-zinc-500 text-[10px] uppercase">Cerrar</button>
              <button onClick={async () => { await supabase.from('templates').insert([newTemplate]); setShowModal(false); fetchData(); }} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ZOOM FOTO */}
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black/98 z-[300] flex items-center justify-center p-10 cursor-pointer" onClick={() => setFullScreenImage(null)}>
          <img src={fullScreenImage} className="max-w-full max-h-full object-contain shadow-2xl rounded-xl" alt="Zoom"/>
        </div>
      )}
    </div>
  );
}