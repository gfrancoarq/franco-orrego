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
  const [templates, setTemplates] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: '', type: 'text', content: '' });

  useEffect(() => {
    if (!supabase) return;
    const loadData = async () => {
      const { data: c } = await supabase.from('chats').select('*').order('is_pinned', { ascending: false });
      const { data: t } = await supabase.from('templates').select('*');
      setChats(c || []);
      setTemplates(t || []);
    };
    loadData();
  }, []);

  if (!supabase) return <div className="p-10 text-center font-bold">Error de Configuración (Revisa Vercel)</div>;

  return (
    <div className="flex h-screen bg-gray-200 font-sans overflow-hidden">
      
      {/* COLUMNA IZQUIERDA (WHATSAPP STYLE) */}
      <div className="w-80 bg-white border-r border-gray-300 flex flex-col shadow-xl z-10">
        <div className="p-4 bg-black text-white flex justify-between items-center">
          <span className="font-black italic">FRANCO ORREGO</span>
          <span className="text-[10px] bg-blue-600 px-2 py-0.5 rounded">V.2.5</span>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-10 text-center text-gray-400 text-xs italic">No hay chats aún.</div>
          ) : (
            chats.map(chat => (
              <div 
                key={chat.id} 
                onClick={() => setSelectedChat(chat)}
                className={`p-4 border-b border-gray-100 cursor-pointer flex justify-between items-center hover:bg-gray-50 ${selectedChat?.id === chat.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''}`}
              >
                <div>
                  <p className="font-bold text-gray-800 text-sm">{chat.phone_number === 'test_account' ? '🛠 CHAT TEST' : chat.phone_number}</p>
                  <p className="text-[9px] font-black text-blue-500 uppercase">{chat.lead_temperature}</p>
                </div>
                <div className={`w-3 h-3 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PANEL CENTRAL Y DERECHO */}
      <div className="flex-1 flex flex-col bg-white">
        
        {/* HEADER */}
        <div className="h-16 border-b border-gray-200 bg-gray-50 flex items-center px-6 justify-between shadow-sm">
          <span className="font-bold text-gray-600">{selectedChat ? selectedChat.phone_number : "Selecciona un cliente"}</span>
          <div className="flex gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span className="text-xs font-bold text-gray-400 uppercase">Franco Mode</span>
          </div>
        </div>

        {/* AREA DE MENSAJES */}
        <div className="flex-1 bg-[#E5DDD5] overflow-y-auto p-6 flex flex-col gap-4">
          {!selectedChat ? (
            <div className="m-auto text-center bg-white/50 backdrop-blur-sm p-6 rounded-2xl shadow-xl">
              <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Bienvenido a la Consola</p>
              <p className="text-[10px] text-gray-400 mt-2">Selecciona un chat a la izquierda para empezar a disparar audios.</p>
            </div>
          ) : (
            <div className="bg-white p-4 rounded-lg shadow-sm max-w-xs text-sm">
              Historial conectado. Listo para disparar.
            </div>
          )}
        </div>

        {/* PANEL DE DISPARADORES (SIEMPRE VISIBLE) */}
        <div className="p-4 bg-gray-100 border-t border-gray-300">
          <div className="flex justify-between items-center mb-3">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tus Disparadores</span>
            <button onClick={() => setShowModal(true)} className="text-[10px] bg-black text-white px-3 py-1 rounded-full font-bold">+ NUEVO BOTÓN</button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {templates.length === 0 ? (
              <div className="col-span-full py-4 text-center border-2 border-dashed border-gray-300 rounded-xl text-gray-400 text-[10px] font-bold">
                No tienes botones creados. Dale a "+ NUEVO BOTÓN" para empezar.
              </div>
            ) : (
              templates.map(t => (
                <button 
                  key={t.id} 
                  className={`p-3 rounded-xl border-b-4 border-gray-300 font-bold text-[10px] flex items-center justify-center gap-2 transition-all ${selectedChat ? 'bg-white hover:bg-blue-50 active:translate-y-1 active:border-b-0' : 'bg-gray-200 opacity-50 cursor-not-allowed'}`}
                >
                  {t.type === 'audio' ? '🔊' : '💬'} {t.label}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* MODAL DE CREACIÓN */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-black mb-4 italic uppercase">Nuevo Disparador</h2>
            <input type="text" placeholder="NOMBRE DEL BOTÓN" className="w-full p-3 bg-gray-100 rounded-xl mb-3 text-sm font-bold outline-none" onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}/>
            <select className="w-full p-3 bg-gray-100 rounded-xl mb-4 text-sm font-bold outline-none" onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}>
              <option value="text">TEXTO</option>
              <option value="audio">AUDIO</option>
            </select>
            {newTemplate.type === 'text' ? (
              <textarea placeholder="Escribe el mensaje aquí..." className="w-full p-3 bg-gray-100 rounded-xl mb-4 h-24 text-sm outline-none" onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}/>
            ) : (
              <div className="p-4 bg-blue-50 rounded-xl text-center mb-4 border border-blue-200 text-[10px] font-bold text-blue-600">
                El grabador se activará al guardar [Módulo Audio v2]
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 font-bold text-gray-400 text-xs">CANCELAR</button>
              <button 
                onClick={async () => {
                  await supabase.from('templates').insert([newTemplate]);
                  const {data} = await supabase.from('templates').select('*');
                  setTemplates(data);
                  setShowModal(false);
                }} 
                className="flex-1 py-3 bg-black text-white rounded-xl font-bold text-xs shadow-lg"
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