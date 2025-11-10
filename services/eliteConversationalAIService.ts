
import { GoogleGenAI, Modality, LiveServerMessage, Type, FunctionDeclaration, Chat, GenerateContentResponse, Part } from "@google/genai";
import { ProceduralUISpec, ConversationContext, ChatMessage, UIElement } from '../types';
import { ELITE_CONFIG, OPTIMIZED_SYSTEM_PROMPT } from "../config/eliteConfig";

// Helper function to convert Uint8Array to Base64
function encode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.byteLength; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

// Helper function to convert Base64 to Uint8Array
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

class EliteConversationalAI {
  private session: any | null = null;
  private sessionPromise: Promise<any> | null = null;
  private chat: Chat | null = null;
  
  private onUIGenerated!: (spec: ProceduralUISpec) => void;
  private onVoiceOutput!: (audioData: Uint8Array) => void;
  private userLocation: { latitude: number; longitude: number } | null = null;


  private context: ConversationContext = {
    userStyle: "casual",
    preferredVoice: "expressive",
    interactionHistory: [],
    personalizations: {},
  };

  private getClient(): GoogleGenAI {
      if (!process.env.API_KEY) {
          throw new Error("API_KEY environment variable not set. Please select a key.");
      }
      return new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private getSystemPrompt(): string {
     return OPTIMIZED_SYSTEM_PROMPT
      .replace('${this.context.preferredVoice}', this.context.preferredVoice)
      .replace('${this.context.userStyle}', this.context.userStyle);
  }
  
  public setUserLocation(coords: { latitude: number; longitude: number }) {
    console.log("Setting user location:", coords);
    this.userLocation = coords;
  }
  
  startEliteSession(
    onTranscript: (text: string, role: "user" | "model", isFinal: boolean) => void,
    onUIGenerated: (spec: ProceduralUISpec) => void,
    onPersonalizationUpdate: (updates: Record<string, any>) => void,
    onVoiceOutput: (audioData: Uint8Array) => void,
    onError: (error: Error) => void
  ) {
    const client = this.getClient();

    this.onUIGenerated = onUIGenerated;
    this.onVoiceOutput = onVoiceOutput;

    const functionDeclarations: FunctionDeclaration[] = [
        { name: "generate_procedural_ui", description: "Generate or update the UI.", parameters: { type: Type.OBJECT, properties: { spec: { type: Type.OBJECT } } } },
        { name: "generate_image", description: "Generates an image from a text prompt.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING }, aspectRatio: { type: Type.STRING } } } },
        { name: "edit_image", description: "Edits an image based on a text prompt. Requires user to upload an image.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } } } },
        { name: "generate_video", description: "Generates a video from a text prompt or an image.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING }, aspectRatio: { type: Type.STRING } } } },
        { name: "analyze_content", description: "Analyzes a user-provided image, video, or audio file.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING }, contentType: { type: Type.STRING, enum: ['image', 'video', 'audio'] } } } },
        { name: "grounded_search", description: "Searches Google and Google Maps for up-to-date information.", parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } } } },
        { name: "text_chat", description: "Switches to a text-based chat mode.", parameters: { type: Type.OBJECT, properties: { initial_message: { type: Type.STRING } } } },
        { name: "text_to_speech", description: "Converts text to speech.", parameters: { type: Type.OBJECT, properties: { text: { type: Type.STRING } } } },
        { name: "complex_reasoning", description: "Engages 'Thinking Mode' for complex tasks.", parameters: { type: Type.OBJECT, properties: { prompt: { type: Type.STRING } } } },
        { name: "update_personalization", description: "Updates user personalization.", parameters: { type: Type.OBJECT, properties: { userStyle: { type: Type.STRING }, preferredVoice: { type: Type.STRING } } } },
    ];

    let currentInputTranscription = "";
    let currentOutputTranscription = "";

    this.sessionPromise = client.live.connect({
      model: ELITE_CONFIG.liveModel,
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: this.getSystemPrompt(),
        tools: [{ functionDeclarations }],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
      callbacks: {
        onopen: () => console.log("Elite session opened."),
        onclose: () => console.log("Elite session closed."),
        onerror: (e) => {
            console.error("Elite session error:", e);
            onError(new Error("Session error. Please try again."));
        },
        onmessage: (message: LiveServerMessage) => {
          this.handleEliteMessage(message);
          
          if (message.serverContent?.outputTranscription?.text) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscription += text;
              onTranscript(text, 'model', false);
          }
          if (message.serverContent?.inputTranscription?.text) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscription += text;
              onTranscript(text, 'user', false);
          }

          if (message.serverContent?.turnComplete) {
              this.context.interactionHistory.push({ userInput: currentInputTranscription.trim(), aiResponse: currentOutputTranscription.trim(), uiElementsClicked: [], timestamp: Date.now(), });
              onTranscript(currentInputTranscription.trim(), 'user', true);
              onTranscript(currentOutputTranscription.trim(), 'model', true);
              currentInputTranscription = "";
              currentOutputTranscription = "";
          }
        },
      },
    });

    this.sessionPromise.then(session => { this.session = session; }).catch(onError);
  }

  private handleEliteMessage(message: LiveServerMessage) {
    const audioDataB64 = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioDataB64) {
      this.onVoiceOutput(decode(audioDataB64));
    }

    if (message.toolCall?.functionCalls) {
      for (const fc of message.toolCall.functionCalls) {
        // Run tool calls without awaiting them to keep the conversation fluid
        this.executeToolCall(fc.name, fc.args);
      }
    }
  }
  
  private async executeToolCall(name: string, args: any) {
    console.log(`Executing tool: ${name}`, args);
    try {
        switch (name) {
          case "generate_procedural_ui": this.onUIGenerated(args.spec as ProceduralUISpec); break;
          case "generate_image": await this._generateImage(args.prompt, args.aspectRatio); break;
          case "generate_video": await this._generateVideo(args.prompt, undefined, args.aspectRatio); break;
          case "grounded_search": await this._performGroundedSearch(args.query); break;
          case "text_to_speech": await this._speakText(args.text); break;
          case "complex_reasoning": await this._performComplexReasoning(args.prompt); break;
          case "text_chat": await this._startChatSession(args.initial_message); break;
          // Other tools might require file uploads and are initiated from the UI
        }
    } catch (e: any) {
        console.error(`Error executing tool ${name}:`, e);
        this._speakText(`Sorry, I encountered an error with the ${name.replace(/_/g, ' ')} tool.`);
    }
  }

  private async _generateImage(prompt: string, aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" = "1:1") {
      const client = this.getClient();
      const response = await client.models.generateImages({ model: ELITE_CONFIG.imageGenModel, prompt, config: { numberOfImages: 1, aspectRatio } });
      const base64Image = response.generatedImages[0].image.imageBytes;
      const imageUrl = `data:image/png;base64,${base64Image}`;
      this.onUIGenerated({
          layout: 'floating', theme: { colors: { primary: '#8B5CF6', accent: '#EC4899', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter' }, spacing: 16, borderRadius: 12, animations: [] }, behavior: { interactMode: 'hybrid', responsiveness: 'adaptive', personalizedElements: [] },
          elements: [{ id: 'gen-img', type: 'image', position: { x: 50, y: 50 }, props: { src: imageUrl, alt: prompt } }],
      });
  }

  private async _generateVideo(prompt: string, image?: { data: string; mimeType: string }, aspectRatio: "16:9" | "9:16" = "16:9") {
    try {
      const client = this.getClient();
      this.onUIGenerated({
          layout: 'floating',
          theme: { colors: { primary: '#8B5CF6', accent: '#EC4899', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter' }, spacing: 16, borderRadius: 12, animations: [] },
          behavior: { interactMode: 'hybrid', responsiveness: 'adaptive', personalizedElements: [] },
          elements: [{ id: 'video-loading', type: 'card', position: { x: 50, y: 50 }, animation: 'pulse', props: { title: "Generating Video...", description: "This can take a few moments. Please wait." } }],
      });
      let operation = await client.models.generateVideos({ model: ELITE_CONFIG.veoModel, prompt, ...(image && { image: { imageBytes: image.data, mimeType: image.mimeType } }), config: { numberOfVideos: 1, resolution: '720p', aspectRatio } });
      while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          operation = await client.operations.getVideosOperation({ operation: operation });
      }
      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink && process.env.API_KEY) {
        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);
        this.onUIGenerated({
            layout: 'floating', theme: { colors: { primary: '#8B5CF6', accent: '#EC4899', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter' }, spacing: 16, borderRadius: 12, animations: [] }, behavior: { interactMode: 'hybrid', responsiveness: 'adaptive', personalizedElements: [] },
            elements: [{ id: 'gen-vid', type: 'video', position: { x: 50, y: 50 }, props: { src: videoUrl, alt: prompt, autoPlay: true, controls: true } }],
        });
        this._speakText(`Here is the video I created for you about ${prompt}.`);
      } else {
        throw new Error("Video generation completed, but no download link was found.");
      }
    } catch(e: any) {
        console.error("Error in _generateVideo:", e);
        const errorMessage = e.toString();
        if (errorMessage.includes("NOT_FOUND") || errorMessage.includes("404")) {
            const errorText = "Video generation failed. It's likely that the Veo API is not enabled for your project. Please enable the 'Generative AI API' or 'Video Generation API' in your Google Cloud Console and try again.";
            this._speakText(errorText);
            this.onUIGenerated({
                layout: 'floating',
                theme: { colors: { primary: '#D97706', accent: '#DC2626', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter' }, spacing: 16, borderRadius: 12, animations: [] },
                behavior: { interactMode: 'hybrid', responsiveness: 'adaptive', personalizedElements: [] },
                elements: [{ id: 'video-error', type: 'card', position: { x: 50, y: 50 }, animation: 'fade-in', props: { title: "Video Generation Error", description: errorText } }],
            });
        } else {
            // Rethrow to be caught by the generic handler
            throw e;
        }
    }
  }

  private async _performGroundedSearch(query: string) {
    const client = this.getClient();
    const config: any = {
      tools: [{ googleSearch: {} }, { googleMaps: {} }],
    };

    if (this.userLocation) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: this.userLocation,
        },
      };
    }
    const response = await client.models.generateContent({
      model: ELITE_CONFIG.groundingModel,
      contents: query,
      config: config,
    });
    
    await this._speakText(response.text);
    
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks && groundingChunks.length > 0) {
        // FIX: Explicitly specify the return type of the map callback to UIElement to ensure correct type inference.
        const searchResultElements: UIElement[] = groundingChunks.map((chunk, index): UIElement => {
            const webResult = chunk.web;
            const mapsResult = chunk.maps;
            
            let props: Record<string, any> = {};
            if (webResult) {
                props = { title: webResult.title || "Web Result", snippet: "Click to learn more.", uri: webResult.uri };
            } else if (mapsResult) {
                props = { title: mapsResult.title || "Map Result", snippet: "View on Google Maps.", uri: mapsResult.uri };
            }
            
            return {
                id: `search-result-${index}`,
                type: 'search-result',
                position: { x: 0, y: 0 },
                props,
                animation: 'slide-up',
            };
        }).filter(el => el.props.uri);

        if (searchResultElements.length > 0) {
            this.onUIGenerated({
                layout: 'stack',
                theme: { colors: { primary: '#3B82F6', accent: '#EC4899', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter' }, spacing: 12, borderRadius: 12, animations: [] },
                behavior: { interactMode: 'hybrid', responsiveness: 'adaptive', personalizedElements: [] },
                elements: searchResultElements,
            });
        }
    }
  }
  
  private async _performComplexReasoning(prompt: string) {
      const client = this.getClient();
      const response = await client.models.generateContent({ model: ELITE_CONFIG.complexReasoningModel, contents: prompt, config: { thinkingConfig: { thinkingBudget: 32768 } } });
      await this._speakText(response.text);
      // Generate UI for complex response
  }
  
  private async _startChatSession(initialMessage: string) {
      const client = this.getClient();
      this.chat = client.chats.create({ model: ELITE_CONFIG.chatModel });
      this.sendChatMessage(initialMessage);
      // Generate UI for chat
  }

  public async sendChatMessage(message: string) {
      if (!this.chat) return;
      const response = await this.chat.sendMessage({ message });
      // Update chat UI
  }
  
  public async handleFileUpload(file: File, prompt: string, task: string) {
      const reader = new FileReader();
      reader.onloadend = async () => {
          const base64Data = (reader.result as string).split(',')[1];
          const part: Part = { inlineData: { data: base64Data, mimeType: file.type } };
          const client = this.getClient();
          
          try {
            switch(task) {
                case 'analyze_image':
                    const analyzeImgRes = await client.models.generateContent({ model: ELITE_CONFIG.imageUnderstandingModel, contents: { parts: [part, { text: prompt }] } });
                    this._speakText(analyzeImgRes.text);
                    break;
                case 'edit_image':
                    const editImgRes = await client.models.generateContent({ model: ELITE_CONFIG.imageEditModel, contents: { parts: [part, { text: prompt }] }, config: { responseModalities: [Modality.IMAGE] } });
                    const imagePart = editImgRes.candidates?.[0]?.content?.parts.find(p => p.inlineData && p.inlineData.mimeType.startsWith('image/'));
                    if (imagePart?.inlineData) {
                        const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
                         this.onUIGenerated({
                            layout: 'floating', theme: { colors: { primary: '#8B5CF6', accent: '#EC4899', background: 'transparent' }, typography: { size: '16px', weight: '400', family: 'Inter' }, spacing: 16, borderRadius: 12, animations: [] }, behavior: { interactMode: 'hybrid', responsiveness: 'adaptive', personalizedElements: [] },
                            elements: [{ id: 'edit-img', type: 'image', position: { x: 50, y: 50 }, props: { src: imageUrl, alt: prompt } }],
                        });
                    }
                    break;
                case 'generate_video':
                    this._generateVideo(prompt, { data: base64Data, mimeType: file.type });
                    break;
                // Add cases for video/audio analysis
            }
          } catch (e: any) {
              console.error(`Error handling file upload for task ${task}:`, e);
              this._speakText("I'm sorry, I ran into a problem processing that file.");
          }
      };
      reader.readAsDataURL(file);
  }

  private async _speakText(text: string) {
    if (!text) return;
    const client = this.getClient();
    const response = await client.models.generateContent({ model: ELITE_CONFIG.ttsModel, contents: [{ parts: [{ text }] }], config: { responseModalities: [Modality.AUDIO] } });
    const audioB64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (audioB64) {
        this.onVoiceOutput(decode(audioB64));
    }
  }

  async sendVoiceInput(audioBuffer: Float32Array) {
    if (!this.sessionPromise) return;
    const l = audioBuffer.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) { int16[i] = audioBuffer[i] * 32768; }
    const base64Audio = encode(new Uint8Array(int16.buffer));
    this.sessionPromise.then(session => session.sendRealtimeInput({ media: { data: base64Audio, mimeType: `audio/pcm;rate=${ELITE_CONFIG.voice.inputSampleRate}` } }));
  }

  async close() {
    this.session?.close();
    this.session = null;
    this.sessionPromise = null;
  }
}

export const eliteAI = new EliteConversationalAI();