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

  // --- UTILIDADES DE TIEMPO ---
  // Actualizamos el reloj interno cada minuto para que las alarmas cambien solas
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const getChatStatus = (lastMessageAt) => {
    if (!lastMessageAt) return { color: 'text-zinc-600', label: 'Sin actividad', hoursLeft: 24 };
    const diffHours = (currentTime - new Date(lastMessageAt)) / (1000 * 60 * 60);
    const hoursLeft = Math.max(0, 24 - diffHours);

    if (diffHours >= 24) return { color: 'bg-zinc-900 border-zinc-700 text-zinc-500', label: 'VENTANA CERRADA', hoursLeft: 0, critical: false };
    if (diffHours >= 20) return { color: 'bg-red-900/40 border-red-500 animate-pulse text-red-200', label: `CRÍTICO: ${hoursLeft.toFixed(1)}h`, hoursLeft, critical: true };
    if (diffHours >= 16) return { color: 'bg-orange-900/20 border-orange-500 text-orange-200', label: `AVISO: ${hoursLeft.toFixed(1)}h`, hoursLeft, critical: true };
    return { color: 'bg-zinc-800 border-zinc-700 text-zinc-400', label: `Abierto: ${hoursLeft.toFixed(1)}h`, hoursLeft, critical: false };
  };

  // --- CARGA Y REALTIME ---
  const fetchData = async () => {
    if (!supabase) return;
    try {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    } catch (err) { console.error(err); }
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

  // --- ENVÍO INTELIGENTE (API vs WHATSAPP WEB) ---
  const handleManualSend = async () => {
    if (!inputText || !selectedChat) return;

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const diffHours = lastUserMsg ? (currentTime - new Date(lastUserMsg.created_at)) / (1000 * 60 * 60) : 0;

    if (diffHours >= 24) {
      // PUENTE WHATSAPP WEB
      const cleanPhone = selectedChat.phone_number.replace(/\D/g, '');
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(inputText)}`;
      window.open(url, '_blank');
      setInputText("");
      return;
    }

    // ENVÍO NORMAL POR API
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

  const saveTemplate = async () => {
    if (!newTemplate.label || !newTemplate.content || !supabase) return;
    await supabase.from('templates').insert([newTemplate]);
    setShowModal(false);
    setNewTemplate({ label: '', type: 'text', content: '' });
    fetchData();
  };

  if (!supabase) return <div className="p-20 text-white bg-black h-screen text-center font-black">Faltan Variables</div>;

  return (
    <div className="flex h-screen bg-black text-white font-sans overflow-hidden">
      
      {/* SIDEBAR CON ALARMAS */}
      <div className="w-80 border-r border-zinc-800 flex flex-col bg-[#050505]">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-black italic text-blue-500 tracking-tighter">FRANCO ORREGO</h1>
          <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-1">Status Center</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.map(chat => {
            const status = getChatStatus(chat.last_message_at);
            return (
              <div 
                key={chat.id} 
                onClick={() => loadHistory(chat)} 
                className={`p-4 border-b border-zinc-900 cursor-pointer transition-all ${selectedChat?.id === chat.id ? 'bg-zinc-800 border-l-4 border-l-blue-600' : 'hover:bg-zinc-900'} ${status.critical ? status.color : ''}`}
              >
                <div className="flex justify-between items-center">
                  <p className="font-bold text-sm tracking-tight">{chat.phone_number}</p>
                  <div className={`w-2 h-2 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500 shadow-[0_0_8px_pink]' : 'bg-blue-500 shadow-[0_0_8px_cyan]'}`}></div>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-[8px] font-black uppercase tracking-widest opacity-60">{chat.lead_temperature || 'TIBIO'}</span>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded ${status.critical ? 'bg-black/40' : ''}`}>
                    {status.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 flex flex-col bg-[#0a0a0a]">
        <div className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-900/30 justify-between">
          <span className="font-bold text-[10px] uppercase tracking-widest text-zinc-500">
            {selectedChat ? `CONVERSANDO CON: ${selectedChat.phone_number}` : "SELECCIONA UN LEAD"}
          </span>
          {selectedChat && (
            <div className="text-[9px] font-black bg-zinc-800 px-3 py-1 rounded-full text-zinc-400 uppercase tracking-tighter">
              Ventana: {getChatStatus(selectedChat.last_message_at).label}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 bg-black/50">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-zinc-800 self-start text-zinc-200 border border-zinc-700' : 'bg-blue-600 self-end font-semibold text-white shadow-xl'}`}>
              {m.message_type === 'image' ? (
                <img src={m.media_url} alt="Ref" className="rounded-lg w-56 cursor-pointer hover:scale-[1.02] transition-transform" onClick={() => setFullScreenImage(m.media_url)}/>
              ) : m.content}
              <p className="text-[8px] mt-1 opacity-40 uppercase font-black tracking-widest">
                {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT MANUAL CON INDICACIÓN DE MODO */}
        <div className="p-4 bg-zinc-900/80 border-t border-zinc-800 flex gap-3 backdrop-blur-md">
          <input 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSend()}
            placeholder={getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? "⚠️ Ventana cerrada. Se abrirá WA Web..." : "Escribe un mensaje..."}
            className="flex-1 bg-black border border-zinc-800 rounded-2xl px-6 py-3 text-sm outline-none focus:border-blue-500 transition-all text-white placeholder:text-zinc-600"
          />
          <button 
            onClick={handleManualSend} 
            className={`px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'}`}
          >
            {getChatStatus(selectedChat?.last_message_at).hoursLeft === 0 ? 'Abrir WA' : 'Enviar'}
          </button>
        </div>

        {/* DISPARADORES */}
        <div className="p-6 bg-black border-t border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Disparadores Rápidos</span>
            <button onClick={() => setShowModal(true)} className="text-[9px] font-black bg-white text-black px-4 py-1.5 rounded-full hover:bg-blue-600 hover:text-white transition-all">+ CREAR</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map(t => (
              <button key={t.id} onClick={() => fetch('/api/webhook', { method: 'POST', body: JSON.stringify({ action: 'send_template', phone_number: selectedChat.phone_number, template_id: t.id }) })} className="bg-zinc-900 border border-zinc-800 px-5 py-2.5 rounded-xl text-[10px] font-black hover:border-blue-500 hover:text-blue-500 transition-all uppercase tracking-tight">
                {t.type === 'audio' ? '🔊' : '💬'} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* MODAL NUEVO DISPARADOR */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center p-4 z-[200] backdrop-blur-sm">
          <div className="bg-zinc-900 p-8 rounded-[40px] w-full max-w-sm border border-zinc-800 shadow-2xl animate-in fade-in zoom-in">
            <h2 className="text-xl font-black italic mb-6 uppercase tracking-tighter text-white">Nuevo Disparador</h2>
            <input type="text" placeholder="Nombre (Ej: Saludo)" className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white outline-none focus:border-blue-500" onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}/>
            <select className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-4 text-sm font-bold text-white outline-none focus:border-blue-500 appearance-none" onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}>
              <option value="text">Mensaje de Texto</option>
              <option value="audio">Nota de Voz (URL)</option>
            </select>
            <textarea placeholder="Escribe el mensaje o pega el link del audio..." className="w-full p-4 bg-black border border-zinc-800 rounded-2xl mb-6 h-32 text-sm font-medium outline-none focus:border-blue-500 resize-none" onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}/>
            <div className="flex gap-4">
              <button onClick={() => setShowModal(false)} className="flex-1 py-4 font-black text-zinc-500 text-[10px] uppercase tracking-widest hover:text-white transition-colors">Cerrar</button>
              <button onClick={saveTemplate} className="flex-1 py-4 bg-blue-600 text-white rounded-3xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-900/20 hover:bg-blue-500 transition-all">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ZOOM IMAGEN */}
      {fullScreenImage && (
        <div className="fixed inset-0 bg-black/98 z-[300] flex items-center justify-center p-10 cursor-pointer animate-in fade-in" onClick={() => setFullScreenImage(null)}>
          <img src={fullScreenImage} className="max-w-full max-h-full object-contain rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.1)]" alt="Zoom"/>
          <button className="absolute top-10 right-10 text-white font-black text-xl bg-white/10 w-12 h-12 rounded-full backdrop-blur-md hover:bg-white/20 transition-all">✕</button>
        </div>
      )}
    </div>
  );
}