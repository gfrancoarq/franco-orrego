'use client';
import { useState, useEffect, useRef } from 'react';
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
  const [pendingSend, setPendingSend] = useState(null);
  const timerRef = useRef(null);
  
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
        .order('is_pinned', { ascending: false })
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

  // --- LÓGICA DE ENVÍO CON BOTÓN DE PÁNICO (10 Segundos) ---
  const sendTrigger = (template) => {
    if (!selectedChat) return;

    // Si ya hay uno pendiente, limpiamos el anterior
    if (timerRef.current) clearTimeout(timerRef.current);

    const sendId = Date.now();
    setPendingSend({ id: sendId, label: template.label, template });

    // Iniciamos la cuenta regresiva de 10 segundos
    timerRef.current = setTimeout(async () => {
      await executeSend(template, sendId);
    }, 10000);
  };

  const executeSend = async (template, sendId) => {
    // Solo enviamos si el ID actual sigue coincidiendo (no fue cancelado)
    setPendingSend((current) => {
      if (current?.id === sendId) {
        // Registro en base de datos
        supabase.from('messages').insert({
          phone_number: selectedChat.phone_number,
          role: 'assistant',
          content: template.type === 'audio' ? `[AUDIO: ${template.label}]` : template.content
        }).then(({ error }) => {
          if (!error && selectedChat.phone_number !== 'test_account') {
            // Llamada real a la API de WhatsApp
            fetch('/api/whatsapp', {
              method: 'POST',
              body: JSON.stringify({
                phone_number: selectedChat.phone_number,
                template_id: template.id,
                action: 'send_template'
              })
            });
          }
        });
        return null;
      }
      return current;
    });
  };

  const cancelSend = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPendingSend(null);
    alert("Envío anulado correctamente.");
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
    
    setTimeout(async () => {
      if (audioBlob) {
        const fileName = `template_${Date.now()}.ogg`;
        const { data, error } = await supabase.storage
          .from('audios-alicia')
          .upload(fileName, audioBlob);

        if (data) {
          const { data: urlData } = supabase.storage.from('audios-alicia').getPublicUrl(fileName);
          setNewTemplate({ ...newTemplate, content: urlData.publicUrl, type: 'audio' });
          alert("Audio procesado con éxito.");
        }
      }
    }, 600);
  };

  const saveTemplate = async () => {
    if (!newTemplate.label || !newTemplate.content) return alert("Faltan datos.");
    const { error } = await supabase.from('templates').insert([newTemplate]);
    if (!error) {
      setShowModal(false);
      setNewTemplate({ label: '', type: 'text', content: '' });
      const { data } = await supabase.from('templates').select('*');
      setTemplates(data || []);
    }
  };

  return (
    <div className="flex h-screen bg-gray-100 flex-col md:flex-row font-sans overflow-hidden">
      
      {/* 1. LISTA DE CHATS */}
      <div className="w-full md:w-1/3 bg-white border-r overflow-y-auto shadow-inner flex flex-col h-1/3 md:h-full">
        <div className="p-4 bg-gray-900 text-white font-bold sticky top-0 z-10 flex justify-between">
          <span>Chats Activos</span>
          <span className="text-xs text-gray-400">v2.0</span>
        </div>
        {chats.map(chat => (
          <div 
            key={chat.id} 
            onClick={() => { setSelectedChat(chat); setPendingSend(null); }}
            className={`p-4 border-b cursor-pointer flex justify-between items-center transition-colors ${selectedChat?.id === chat.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
          >
            <div className="truncate">
              <p className="font-bold text-gray-800 text-sm">
                {chat.phone_number === 'test_account' ? '🛠 CHAT DE PRUEBA' : chat.phone_number}
              </p>
              <span className={`text-[9px] uppercase font-black px-2 py-0.5 rounded-full ${chat.lead_temperature === 'caliente' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                {chat.lead_temperature}
              </span>
            </div>
            <div className={`w-4 h-4 rounded-full flex-shrink-0 ${chat.assigned_to === 'Mari' ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
          </div>
        ))}
      </div>

      {/* 2. VENTANA DE CHAT Y PANEL */}
      <div className="flex-1 flex flex-col h-2/3 md:h-full bg-white relative">
        {selectedChat ? (
          <>
            {/* Cabecera Chat */}
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
              <span className="font-black text-gray-700 text-sm">{selectedChat.phone_number}</span>
              <div className="flex gap-1">
                <button className="text-[10px] bg-pink-100 text-pink-600 px-2 py-1 rounded-full font-bold">Mari</button>
                <button className="text-[10px] bg-blue-100 text-blue-600 px-2 py-1 rounded-full font-bold">Franco</button>
              </div>
            </div>

            {/* BARRA DE PÁNICO (Solo aparece si hay envío pendiente) */}
            {pendingSend && (
              <div className="bg-red-600 text-white p-3 flex justify-between items-center animate-pulse z-20">
                <span className="text-xs font-bold uppercase tracking-tighter">Enviando {pendingSend.label}...</span>
                <button onClick={cancelSend} className="bg-white text-red-600 px-3 py-1 rounded-lg text-xs font-black shadow-lg">
                  ANULAR
                </button>
              </div>
            )}

            <div className="flex-1 p-4 overflow-y-auto bg-[#e5ddd5] flex flex-col gap-2">
               <div className="bg-white p-3 rounded-lg shadow-sm self-start text-xs max-w-[80%]">
                 Hola, soy Alicia. Aquí verás los mensajes.
               </div>
            </div>
            
            {/* 3. PANEL DE DISPARADORES */}
            <div className="p-3 border-t bg-gray-100 grid grid-cols-2 gap-2 max-h-[40%] overflow-y-auto">
              {templates.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => sendTrigger(t)}
                  className="bg-white border-b-2 border-gray-300 active:border-b-0 active:translate-y-0.5 p-3 rounded-xl shadow-sm text-xs font-bold flex items-center justify-center gap-2 text-gray-700"
                >
                  {t.type === 'audio' ? '🔊' : '💬'} {t.label}
                </button>
              ))}
              <button 
                onClick={() => setShowModal(true)}
                className="border-2 border-dashed border-gray-400 p-3 rounded-xl text-gray-500 text-xs font-bold flex items-center justify-center bg-gray-50"
              >
                + NUEVO BOTÓN
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 font-bold uppercase text-xs tracking-widest">
            Selecciona un chat
          </div>
        )}
      </div>

      {/* MODAL DE CREACIÓN */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-xl font-black mb-4 text-gray-800 uppercase italic">Crear Disparador</h2>
            
            <input 
              type="text" 
              placeholder="NOMBRE DEL BOTÓN" 
              className="w-full p-3 bg-gray-100 border-none rounded-xl mb-3 font-bold text-sm outline-none"
              onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}
            />

            <select 
              className="w-full p-3 bg-gray-100 border-none rounded-xl mb-4 font-bold text-sm outline-none"
              onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}
            >
              <option value="text">TEXTO</option>
              <option value="audio">AUDIO (NOTA DE VOZ)</option>
            </select>
            
            {newTemplate.type === 'text' ? (
              <textarea 
                placeholder="Escribe el mensaje..." 
                className="w-full p-3 bg-gray-100 border-none rounded-xl mb-4 h-24 text-sm outline-none"
                onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}
              />
            ) : (
              <div className="bg-blue-50 p-4 rounded-xl text-center mb-4 border border-blue-200">
                {!isRecording ? (
                  <button onClick={startRecording} className="bg-blue-500 text-white px-6 py-2 rounded-full font-bold text-xs uppercase shadow-md">Iniciar Micro 🎤</button>
                ) : (
                  <button onClick={stopAndUpload} className="bg-red-500 text-white px-6 py-2 rounded-full font-bold text-xs uppercase animate-pulse">Detener y Guardar ⏹</button>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 font-bold text-gray-400 text-sm">CERRAR</button>
              <button onClick={saveTemplate} className="flex-1 py-3 bg-black text-white rounded-xl font-bold text-sm shadow-xl">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}