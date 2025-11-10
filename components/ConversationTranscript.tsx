
import React, { useRef, useEffect } from 'react';
import type { TranscriptMessage } from '../types';

interface ConversationTranscriptProps {
  messages: TranscriptMessage[];
}

export const ConversationTranscript: React.FC<ConversationTranscriptProps> = ({ messages }) => {
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="bg-black bg-opacity-30 rounded-2xl p-4 flex flex-col h-full overflow-y-auto">
      <div className="flex-grow space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg px-4 py-2 rounded-xl ${
                msg.role === 'user'
                  ? 'bg-blue-600 rounded-br-none'
                  : 'bg-red-800 rounded-bl-none'
              }`}
            >
              <p className="text-white whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={endOfMessagesRef} />
      </div>
    </div>
  );
};