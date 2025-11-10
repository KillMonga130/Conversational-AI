
import { Type as GenAIType } from "@google/genai";

export const Type = GenAIType;

export interface UIElement {
  id: string;
  type: "button" | "card" | "slider" | "input" | "display" | "animation" | "image" | "video" | "file-upload" | "search-result" | "chat-window";
  props: Record<string, any>;
  position: { x: number; y: number };
  animation?: "fade-in" | "slide-up" | "pulse" | "bounce" | "glow";
  metadata?: Record<string, any>;
}

export interface ProceduralUISpec {
  layout: "grid" | "flex" | "stack" | "carousel" | "floating";
  elements: UIElement[];
  theme: {
    colors: { primary: string; accent: string; background: string };
    typography: { size: string; weight: string; family: string };
    spacing: number;
    borderRadius: number;
    animations: string[];
  };
  behavior: {
    interactMode: "click" | "voice" | "hybrid";
    responsiveness: "static" | "fluid" | "adaptive";
    personalizedElements: string[];
  };
}

export interface ConversationContext {
  userStyle: "technical" | "casual" | "formal" | "creative";
  preferredVoice: "expressive" | "calm" | "energetic" | "neutral";
  interactionHistory: Array<{
    userInput: string;
    aiResponse: string;
    uiElementsClicked: string[];
    timestamp: number;
  }>;
  personalizations: Record<string, any>;
}

export interface TranscriptMessage {
  text: string;
  role: 'user' | 'model';
  id: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: [{ text: string }];
}
