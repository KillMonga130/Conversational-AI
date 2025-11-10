
import React, { useEffect, useState, useRef, useCallback } from "react";
import { eliteAI } from "../services/eliteConversationalAIService";
import { ProceduralUIRenderer } from "./ProceduralUIRenderer";
import { ConversationTranscript } from "./ConversationTranscript";
import { VoiceController, VoiceControllerHandles } from "./VoiceController";
import type { ProceduralUISpec, TranscriptMessage } from "../types";

async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length;
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
}

const initialUISpec: ProceduralUISpec = {
    layout: 'floating',
    theme: { colors: { primary: '#DC2626', accent: '#3B82F6', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter, sans-serif' }, spacing: 16, borderRadius: 12, animations: [] },
    behavior: { interactMode: 'voice', responsiveness: 'adaptive', personalizedElements: [] },
    elements: [
      { id: 'welcome-card', type: 'card', position: { x: 50, y: 30 }, animation: 'fade-in', props: { title: "I'm listening...", description: "I build UIs for you in real-time based on your voice commands. Try saying one of the phrases below!" } },
      { id: 'prompt-1', type: 'card', position: { x: 25, y: 65 }, animation: 'slide-up', props: { description: '“Generate an image of a robot skateboarding”' } },
      { id: 'prompt-2', type: 'card', position: { x: 50, y: 65 }, animation: 'slide-up', props: { description: '“What are some good restaurants near me?”' } },
      { id: 'prompt-3', type: 'card', position: { x: 75, y: 65 }, animation: 'slide-up', props: { description: '“Create a video of a sunset over the ocean”' } },
    ],
  };


export const EliteInterface: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([]);
  const [currentUISpec, setCurrentUISpec] = useState<ProceduralUISpec | null>(null);
  const [personalizations, setPersonalizations] = useState({});
  
  const voiceControllerRef = useRef<VoiceControllerHandles>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextStartTimeRef = useRef(0);

  const processAudioQueue = useCallback(async () => {
      if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
      isPlayingRef.current = true;
      const audioData = audioQueueRef.current.shift();
      if (!audioData || !audioContextRef.current) { isPlayingRef.current = false; return; }
      try {
          nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioContextRef.current.currentTime);
          const audioBuffer = await decodeAudioData(audioData, audioContextRef.current);
          const source = audioContextRef.current.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContextRef.current.destination);
          source.onended = () => { isPlayingRef.current = false; processAudioQueue(); };
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += audioBuffer.duration;
      } catch (e) {
          console.error("Error playing audio:", e);
          isPlayingRef.current = false;
      }
  }, []);

  const onUIGenerated = useCallback((spec: ProceduralUISpec) => {
    setCurrentUISpec(spec);
  }, []);

  const onPersonalizationUpdate = useCallback((updates: Record<string, any>) => {
    setPersonalizations((prev) => ({ ...prev, ...updates }));
  }, []);

  const onVoiceOutput = useCallback((audioData: Uint8Array) => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    audioQueueRef.current.push(audioData);
    processAudioQueue();
  }, [processAudioQueue]);

  const onTranscript = useCallback((text: string, role: "user" | "model", isFinal: boolean) => {
    setTranscript(prev => {
        const newTranscript = [...prev];
        const lastMessage = newTranscript[newTranscript.length - 1];
        if (lastMessage && lastMessage.role === role && !isFinal) {
            lastMessage.text += text;
        } else if (isFinal) {
             const finalTranscript = prev.filter(m => !m.text.includes(text.substring(0,20)));
             finalTranscript.push({ text: text, role, id: Date.now().toString() });
             return finalTranscript;
        } else {
            newTranscript.push({ text, role, id: Date.now().toString() });
        }
        return newTranscript;
    });
  }, []);

  const handleSessionError = useCallback((err: Error) => {
    console.error("Session Error:", err);
    if (err.message.includes("NOT_FOUND") || err.message.includes("Requested entity was not found")) {
        setError("Your API Key may be invalid or missing permissions. Please select a valid key and try again.");
    } else {
        setError(err.message || "An unknown error occurred during the session.");
    }
    setIsActive(false);
    eliteAI.close();
  }, []);

  const awakeMuse = useCallback(async () => {
    setIsInitializing(true);
    setError(null);
    try {
      if (!(await window.aistudio.hasSelectedApiKey())) {
          await window.aistudio.openSelectKey();
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          eliteAI.setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn("Could not get user location:", error.message);
        }
      );

      eliteAI.startEliteSession(
        onTranscript,
        onUIGenerated,
        onPersonalizationUpdate,
        onVoiceOutput,
        handleSessionError
      );
      setIsActive(true);
      setCurrentUISpec(initialUISpec);
      voiceControllerRef.current?.startListening();
    } catch (e: any) {
      console.error("Failed to awaken elite interface:", e);
      handleSessionError(e);
    } finally {
        setIsInitializing(false);
    }
  }, [onTranscript, onUIGenerated, onPersonalizationUpdate, onVoiceOutput, handleSessionError]);

  const handleUIElementClick = async (elementId: string, value?: any, file?: File) => {
    console.log(`Element clicked: ${elementId}`, { value, file });
    if (file) {
        // Assume the 'value' is the prompt for the file task
        eliteAI.handleFileUpload(file, value, elementId);
    }
  };

  return (
    <div className="w-full h-full">
      {!isActive ? (
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <h1 className="text-4xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-600 mb-4 animate-fade-in-main">
            ✨ ELITE CONVERSATIONAL AI ✨
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8 max-w-2xl animate-fade-in-p">
            Experience the most advanced human interface ever created. Real-time voice, adaptive personality, and a UI that builds itself for you.
          </p>
          <button 
            onClick={awakeMuse} 
            disabled={isInitializing}
            className="px-12 py-4 text-lg font-bold text-white border-none rounded-full bg-gradient-to-br from-blue-600 to-red-600 cursor-pointer shadow-lg transition-all duration-300 ease-in-out hover:scale-105 hover:shadow-2xl active:scale-95 disabled:opacity-50 disabled:cursor-wait animate-fade-in-btn"
          >
            {isInitializing ? 'Awakening...' : 'Awaken the Elite Interface'}
          </button>
          {error && <p className="text-red-400 mt-4 animate-fade-in-main">{error}</p>}
        </div>
      ) : (
        <div className="grid grid-rows-[1fr_auto] md:grid-rows-1 md:grid-cols-[2fr_1fr] gap-5 h-full p-5">
          <div className="relative w-full h-full bg-black bg-opacity-20 rounded-2xl overflow-hidden animate-fade-in-main">
             <ProceduralUIRenderer
                spec={currentUISpec}
                onElementClick={handleUIElementClick}
                personalizations={personalizations}
             />
          </div>
          <div className="flex flex-col gap-5 h-full animate-fade-in-main row-start-2 md:row-start-auto md:col-start-2">
            <ConversationTranscript messages={transcript} />
            <VoiceController
              ref={voiceControllerRef}
              onAudioData={(audioData) => eliteAI.sendVoiceInput(audioData)}
            />
          </div>
        </div>
      )}
    </div>
  );
};