'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ConsolaVentas() {
  // --- ESTADOS ---
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [templates, setTemplates] = useState([]);
  
  // Estados para Modal y Nuevo Disparador
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: '', type: 'text', content: '' });

  // Estados para Grabación de Audio
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // --- CARGA DE DATOS ---
  useEffect(() => {
    const fetchChats = async () => {
      const { data } = await supabase
        .from('chats')
        .select('*')
        .order('is_pinned', { ascending: false }) // Chat de Test arriba
        .order('updated_at', { ascending: false });
      setChats(data || []);
    };

    const fetchTemplates = async () => {
      const { data } = await supabase.from('templates').select('*');
      setTemplates(data || []);
    };

    fetchChats();
    fetchTemplates();
  }, []);

  // --- LÓGICA DE ENVÍO ---
  const sendTrigger = async (template) => {
    if (!selectedChat) return;

    // Guardar en Supabase para que se vea en el historial
    const { error } = await supabase.from('messages').insert({
      phone_number: selectedChat.phone_number,
      role: 'assistant',
      content: template.type === 'audio' ? `[AUDIO: ${template.label}]` : template.content
    });

    if (!error && selectedChat.phone_number !== 'test_account') {
      // Aquí se disparará la API de Meta para el envío real
      console.log("Enviando a WhatsApp real...");
    }
  };

  // --- LÓGICA DE GRABACIÓN ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
        setAudioBlob(blob);
      };

      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
    } catch (err) {
      alert("Error al acceder al micrófono");
    }
  };

  const stopAndUpload = async () => {
    if (!mediaRecorder) return;
    mediaRecorder.stop();
    setIsRecording(false);
    
    // Esperamos un momento a que el blob esté listo
    setTimeout(async () => {
      if (audioBlob) {
        const fileName = `template_${Date.now()}.ogg`;
        const { data, error } = await supabase.storage
          .from('audios-alicia') // Asegúrate de que este bucket sea PÚBLICO
          .upload(fileName, audioBlob);

        if (data) {
          const { data: urlData } = supabase.storage.from('audios-alicia').getPublicUrl(fileName);
          setNewTemplate({ ...newTemplate, content: urlData.publicUrl, type: 'audio' });
          alert("¡Audio procesado! Ya puedes guardar el disparador.");
        } else {
          console.error("Error subiendo audio:", error);
        }
      }
    }, 500);
  };

  const saveTemplate = async () => {
    if (!newTemplate.label || !newTemplate.content) {
      alert("Por favor completa el nombre y el contenido.");
      return;
    }
    const { error } = await supabase.from('templates').insert([newTemplate]);
    if (!error) {
      setShowModal(false);
      setNewTemplate({ label: '', type: 'text', content: '' });
      const { data } = await supabase.from('templates').select('*');
      setTemplates(data || []);
    }
  };

  // --- RENDERIZADO ---
  return (
    <div className="flex h-screen bg-gray-100 flex-col md:flex-row font-sans">
      
      {/* 1. LISTA DE CHATS */}
      <div className="w-full md:w-1/3 bg-white border-r overflow-y-auto shadow-inner">
        <div className="p-4 bg-gray-900 text-white font-bold sticky top-0 z-10">
          Chats Activos
        </div>
        {chats.map(chat => (
          <div 
            key={chat.id} 
            onClick={() => setSelectedChat(chat)}
            className={`p-4 border-b cursor-pointer flex justify-between items-center transition-colors ${selectedChat?.id === chat.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
          >
            <div>
              <p className="font-bold text-gray-800">
                {chat.phone_number === 'test_account' ? '🛠 CHAT DE PRUEBA' : chat.phone_number}
              </p>
              <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${chat.lead_temperature === 'caliente' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                {chat.lead_temperature}
              </span>
            </div>
            <div className={`w-4 h-4 rounded-full shadow-sm ${chat.assigned_to === 'Mari' ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
          </div>
        ))}
      </div>

      {/* 2. VENTANA DE CHAT */}
      <div className="flex-1 flex flex-col h-full bg-white relative">
        {selectedChat ? (
          <>
            <div className="p-4 border-b bg-gray-50 flex justify-between items-center shadow-sm">
              <span className="font-black text-gray-700">{selectedChat.phone_number}</span>
              <div className="flex gap-2">
                <button className="text-xs bg-pink-100 text-pink-600 px-3 py-1 rounded-full font-bold">A Mari</button>
                <button className="text-xs bg-blue-100 text-blue-600 px-3 py-1 rounded-full font-bold">A Franco</button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto bg-[#e5ddd5]">
               {/* Aquí irá el mapeo de mensajes en el futuro */}
               <div className="bg-white p-3 rounded-lg shadow-sm max-w-xs text-sm">
                 Historial de Supabase conectado. Listo para disparar.
               </div>
            </div>
            
            {/* 3. PANEL DE DISPARADORES */}
            <div className="p-4 border-t bg-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {templates.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => sendTrigger(t)}
                  className="bg-white border-b-4 border-gray-200 active:border-b-0 active:translate-y-1 p-3 rounded-xl shadow-sm text-sm font-bold flex items-center justify-center gap-2 text-gray-700"
                >
                  {t.type === 'audio' ? '🔊' : '💬'} {t.label}
                </button>
              ))}
              <button 
                onClick={() => setShowModal(true)}
                className="border-2 border-dashed border-gray-400 p-3 rounded-xl text-gray-500 text-sm font-bold flex items-center justify-center hover:bg-white transition-all"
              >
                + NUEVO BOTÓN
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 font-bold uppercase tracking-widest">
            Selecciona un chat
          </div>
        )}
      </div>

      {/* MODAL DE CREACIÓN */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-black mb-6 text-gray-800">NUEVO DISPARADOR</h2>
            
            <label className="text-xs font-bold text-gray-500 uppercase">Nombre del Botón</label>
            <input 
              type="text" 
              placeholder="Ej: Manga Vikinga" 
              className="w-full p-3 bg-gray-100 border-none rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
              onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}
            />

            <label className="text-xs font-bold text-gray-500 uppercase">Tipo de Contenido</label>
            <select 
              className="w-full p-3 bg-gray-100 border-none rounded-xl mb-6 outline-none"
              onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}
            >
              <option value="text">Texto</option>
              <option value="audio">Audio (Nota de Voz)</option>
            </select>
            
            {newTemplate.type === 'text' ? (
              <textarea 
                placeholder="Escribe el mensaje que enviará este botón..." 
                className="w-full p-3 bg-gray-100 border-none rounded-xl mb-4 h-32 focus:ring-2 focus:ring-blue-500 outline-none"
                onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
              />
            ) : (
              <div className="bg-blue-50 p-6 rounded-2xl text-center mb-6 border-2 border-blue-100">
                <p className="text-xs font-bold text-blue-600 uppercase mb-4">Grabación de Audio</p>
                {!isRecording ? (
                  <button 
                    onClick={startRecording}
                    className="bg-blue-500 text-white w-16 h-16 rounded-full shadow-lg shadow-blue-200 flex items-center justify-center mx-auto hover:bg-blue-600 transition-transform active:scale-95"
                  >
                    🎤
                  </button>
                ) : (
                  <button 
                    onClick={stopAndUpload}
                    className="bg-red-500 text-white w-16 h-16 rounded-full shadow-lg shadow-red-200 flex items-center justify-center mx-auto animate-pulse"
                  >
                    ⏹
                  </button>
                )}
                <p className="mt-4 text-xs text-blue-400 font-medium">
                  {isRecording ? "Grabando... presiona para detener" : "Toca para empezar a grabar"}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => setShowModal(false)} 
                className="flex-1 py-3 font-bold text-gray-400 hover:text-gray-600"
              >
                CANCELAR
              </button>
              <button 
                onClick={saveTemplate} 
                className="flex-1 py-3 bg-black text-white rounded-xl font-bold shadow-lg active:scale-95 transition-all"
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