'use client';
import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import '../globals.css';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ConsolaVentas() {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [pendingSend, setPendingSend] = useState(null);
  const timerRef = useRef(null);
  
  const [showModal, setShowModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ label: '', type: 'text', content: '' });
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // 1. CARGA DE DATOS
  useEffect(() => {
    const fetchChats = async () => {
      const { data } = await supabase
        .from('chats')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });
      setChats(data || []);
    };
    fetchChats();
    const fetchTemplates = async () => {
      const { data } = await supabase.from('templates').select('*');
      setTemplates(data || []);
    };
    fetchTemplates();
  }, []);

  // 2. TOGGLE IA (Encender/Apagar Alicia)
  const toggleAI = async (chatId, currentState) => {
    const { error } = await supabase
      .from('chats')
      .update({ ai_enabled: !currentState })
      .eq('id', chatId);
    
    if (!error) {
      setChats(chats.map(c => c.id === chatId ? {...c, ai_enabled: !currentState} : c));
      if (selectedChat?.id === chatId) setSelectedChat({...selectedChat, ai_enabled: !currentState});
    }
  };

  // 3. CAMBIO DE ESTADO (Frio/Tibio/Caliente)
  const updateStatus = async (chatId, newTemp) => {
    // Si pasamos a CALIENTE, apagamos la IA automáticamente
    const updates = { 
      lead_temperature: newTemp,
      ai_enabled: newTemp === 'caliente' ? false : true 
    };
    await supabase.from('chats').update(updates).eq('id', chatId);
    setChats(chats.map(c => c.id === chatId ? {...c, ...updates} : c));
    if (selectedChat?.id === chatId) setSelectedChat({...selectedChat, ...updates});
  };

  // 4. ENVÍO CON PÁNICO (10s)
  const sendTrigger = (template) => {
    if (!selectedChat) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const sendId = Date.now();
    setPendingSend({ id: sendId, label: template.label, template });

    timerRef.current = setTimeout(async () => {
      setPendingSend((current) => {
        if (current?.id === sendId) {
          fetch('/api/webhook', {
            method: 'POST',
            body: JSON.stringify({ action: 'send_template', phone_number: selectedChat.phone_number, template_id: template.id })
          });
          return null;
        }
        return current;
      });
    }, 10000);
  };

  // 5. GRABACIÓN DE AUDIO
  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => setAudioBlob(new Blob(chunks, { type: 'audio/ogg; codecs=opus' }));
    recorder.start();
    setMediaRecorder(recorder);
    setIsRecording(true);
  };

  const stopAndUpload = async () => {
    mediaRecorder.stop();
    setIsRecording(false);
    setTimeout(async () => {
      if (audioBlob) {
        const fileName = `temp_${Date.now()}.ogg`;
        const { data } = await supabase.storage.from('audios-alicia').upload(fileName, audioBlob);
        if (data) {
          const { data: url } = supabase.storage.from('audios-alicia').getPublicUrl(fileName);
          setNewTemplate({...newTemplate, content: url.publicUrl, type: 'audio'});
        }
      }
    }, 600);
  };

  return (
    <div className="flex h-screen bg-gray-100 flex-col md:flex-row font-sans overflow-hidden">
      {/* LISTA DE CHATS */}
      <div className="w-full md:w-1/3 bg-white border-r overflow-y-auto h-1/3 md:h-full">
        <div className="p-4 bg-black text-white font-black italic flex justify-between">
          <span>FRANCO ORREGO</span>
          <span className="text-blue-400">V.2.1</span>
        </div>
        {chats.map(chat => (
          <div key={chat.id} onClick={() => setSelectedChat(chat)} className={`p-4 border-b cursor-pointer flex justify-between items-center ${selectedChat?.id === chat.id ? 'bg-blue-50' : ''}`}>
            <div>
              <p className="font-bold text-sm">{chat.phone_number === 'test_account' ? '🛠 TEST' : chat.phone_number}</p>
              <div className="flex gap-1 mt-1">
                <span className={`text-[8px] p-1 rounded font-black text-white ${chat.lead_temperature === 'caliente' ? 'bg-red-500' : 'bg-blue-500'}`}>{chat.lead_temperature}</span>
                {!chat.ai_enabled && <span className="text-[8px] p-1 rounded font-black bg-gray-800 text-white">IA OFF</span>}
              </div>
            </div>
            <div className={`w-3 h-3 rounded-full ${chat.assigned_to === 'Mari' ? 'bg-pink-500' : 'bg-blue-500'}`}></div>
          </div>
        ))}
      </div>

      {/* VENTANA CENTRAL */}
      <div className="flex-1 flex flex-col h-2/3 md:h-full bg-white relative">
        {selectedChat ? (
          <>
            <div className="p-3 border-b bg-gray-50 flex justify-between items-center">
              <span className="font-black text-xs text-gray-500">{selectedChat.phone_number}</span>
              <div className="flex items-center gap-3">
                {/* SWITCH DE IA */}
                <div onClick={() => toggleAI(selectedChat.id, selectedChat.ai_enabled)} className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${selectedChat.ai_enabled ? 'bg-green-500' : 'bg-red-500'}`}>
                  <div className={`bg-white w-4 h-4 rounded-full transition-transform ${selectedChat.ai_enabled ? 'translate-x-6' : ''}`}></div>
                </div>
                <select onChange={(e) => updateStatus(selectedChat.id, e.target.value)} value={selectedChat.lead_temperature} className="text-[10px] font-bold border rounded p-1">
                  <option value="frio">Frio</option>
                  <option value="tibio">Tibio</option>
                  <option value="caliente">Caliente</option>
                </select>
              </div>
            </div>

            {pendingSend && (
              <div className="bg-red-600 text-white p-2 flex justify-between items-center animate-pulse z-20">
                <span className="text-[10px] font-bold uppercase">Enviando {pendingSend.label}...</span>
                <button onClick={() => { clearTimeout(timerRef.current); setPendingSend(null); }} className="bg-white text-red-600 px-3 py-1 rounded text-[10px] font-black">ANULAR</button>
              </div>
            )}

            <div className="flex-1 p-4 overflow-y-auto bg-[#e5ddd5] text-xs">
               <div className="bg-white p-2 rounded shadow-sm self-start inline-block">Historial de Supabase conectado.</div>
            </div>
            
            <div className="p-2 border-t bg-gray-100 grid grid-cols-2 gap-1 overflow-y-auto">
              {templates.map(t => (
                <button key={t.id} onClick={() => sendTrigger(t)} className="bg-white border-b-2 border-gray-300 p-2 rounded-lg text-[10px] font-bold flex items-center justify-center gap-2">
                  {t.type === 'audio' ? '🔊' : '💬'} {t.label}
                </button>
              ))}
              <button onClick={() => setShowModal(true)} className="border-2 border-dashed border-gray-400 p-2 rounded-lg text-gray-400 text-[10px] font-bold">+ NUEVO</button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-300 font-black uppercase text-xs">Selecciona un chat</div>
        )}
      </div>

      {/* MODAL CREACIÓN */}
      {showModal && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4 z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-sm">
            <h2 className="text-lg font-black mb-4 uppercase italic">Nuevo Disparador</h2>
            <input type="text" placeholder="NOMBRE BOTÓN" className="w-full p-2 bg-gray-100 rounded-lg mb-2 text-sm font-bold outline-none" onChange={(e) => setNewTemplate({...newTemplate, label: e.target.value})}/>
            <select className="w-full p-2 bg-gray-100 rounded-lg mb-4 text-sm font-bold outline-none" onChange={(e) => setNewTemplate({...newTemplate, type: e.target.value})}>
              <option value="text">TEXTO</option>
              <option value="audio">AUDIO</option>
            </select>
            {newTemplate.type === 'text' ? (
              <textarea placeholder="Mensaje..." className="w-full p-2 bg-gray-100 rounded-lg mb-4 h-20 text-sm outline-none" onChange={(e) => setNewTemplate({...newTemplate, content: e.target.value})}/>
            ) : (
              <div className="bg-blue-50 p-4 rounded-xl text-center mb-4 border border-blue-200">
                {!isRecording ? <button onClick={startRecording} className="bg-blue-500 text-white px-4 py-2 rounded-full font-bold text-[10px] uppercase">GRABAR 🎤</button> : 
                <button onClick={stopAndUpload} className="bg-red-500 text-white px-4 py-2 rounded-full font-bold text-[10px] uppercase animate-pulse">STOP ⏹</button>}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2 font-bold text-gray-400 text-xs">CERRAR</button>
              <button onClick={async () => {
                await supabase.from('templates').insert([newTemplate]);
                setShowModal(false);
                const {data} = await supabase.from('templates').select('*');
                setTemplates(data);
              }} className="flex-1 py-2 bg-black text-white rounded-lg font-bold text-xs">GUARDAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}