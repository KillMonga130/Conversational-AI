
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

export interface VoiceControllerHandles {
  startListening: () => void;
  stopListening: () => void;
}

interface VoiceControllerProps {
  onAudioData: (audioData: Float32Array) => void;
}

export const VoiceController = forwardRef<VoiceControllerHandles, VoiceControllerProps>(({ onAudioData }, ref) => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  const startListening = async () => {
    if (isListening) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = context;

      const source = context.createMediaStreamSource(stream);
      mediaStreamSourceRef.current = source;

      const processor = context.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
      scriptProcessorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        onAudioData(inputData);
      };

      source.connect(processor);
      processor.connect(context.destination);
      
      setIsListening(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Microphone access denied. Please allow microphone permissions.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (!isListening) return;
    
    mediaStreamSourceRef.current?.disconnect();
    scriptProcessorRef.current?.disconnect();
    audioContextRef.current?.close();

    mediaStreamSourceRef.current = null;
    scriptProcessorRef.current = null;
    audioContextRef.current = null;
    
    setIsListening(false);
  };
  
  useImperativeHandle(ref, () => ({
    startListening,
    stopListening,
  }));
  
  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="bg-black bg-opacity-30 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
      <button
        onClick={isListening ? stopListening : startListening}
        className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out border-4 border-transparent focus:outline-none focus:ring-4 focus:ring-blue-500"
        style={{ background: isListening ? 'radial-gradient(circle, #ef4444, #b91c1c)' : 'radial-gradient(circle, #3b82f6, #1e40af)' }}
      >
        <div className={`w-full h-full rounded-full flex items-center justify-center ${isListening ? 'animate-pulse' : ''}`}>
          {isListening ? (
             <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm5 3a1 1 0 11-2 0V4a1 1 0 112 0v3zm-3.5 6.5A3.5 3.5 0 014 10H3a4 4 0 00.823 2.5H2.5A.5.5 0 002 13v1a.5.5 0 00.5.5H4v.5a.5.5 0 00.5.5h2a.5.5 0 00.5-.5V15h1v-.5a.5.5 0 00-.5-.5H7.177A4.002 4.002 0 008 10h-1a3.5 3.5 0 01-2.5 3.5zM12 10a3.5 3.5 0 013.5 3.5h1a4.002 4.002 0 00-1.177-2.5h.177a.5.5 0 00.5-.5v-1a.5.5 0 00-.5-.5H16v-.5a.5.5 0 00-.5-.5h-2a.5.5 0 00-.5.5V11h-1v.5a.5.5 0 00.5.5H13.5A3.5 3.5 0 0112 10z" clipRule="evenodd" />
             </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </div>
      </button>
      <p className="mt-4 text-lg font-semibold">
        {isListening ? 'Listening...' : 'Tap to Speak'}
      </p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
});