
import React from "react";
import type { ProceduralUISpec, UIElement } from '../types';

interface ProceduralUIRendererProps {
  spec: ProceduralUISpec | null;
  onElementClick: (elementId: string, value?: any, file?: File) => void;
  personalizations: Record<string, any>;
}

const getLayoutClassName = (layout: string) => {
  switch (layout) {
    case "grid": return "grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))]";
    case "flex": return "flex flex-row flex-wrap items-start justify-start";
    case "stack": return "flex flex-col items-stretch";
    case "carousel": return "flex overflow-x-auto snap-x snap-mandatory";
    case "floating": return "relative w-full h-full";
    default: return "flex";
  }
};

const getAnimationClassName = (animation?: string) => {
    if (!animation) return 'animate-fade-in-main';
    const mapping: Record<string, string> = {
        "fade-in": "animate-fade-in-main",
        "slide-up": "animate-[slide-up_0.4s_ease-out]",
        "pulse": "animate-[pulse_1.5s_cubic-bezier(0.4,0,0.6,1)_infinite]",
        "bounce": "animate-[bounce_1s_infinite]",
        "glow": "animate-[glow_2s_ease-in-out_infinite]",
    };
    return mapping[animation] || '';
};

const RenderedElement: React.FC<{ elem: UIElement; onClick: (id: string, value?: any, file?: File) => void, theme: ProceduralUISpec['theme'] }> = ({ elem, onClick, theme }) => {
  const { type, props } = elem;
  const baseProps = { ...props, onClick: () => onClick(elem.id) };

  const themeStyle = {
    '--primary-color': theme.colors.primary,
    '--accent-color': theme.colors.accent,
  } as React.CSSProperties;
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          onClick(elem.id, props.prompt, e.target.files[0]);
      }
  };

  switch (type) {
    case "button": return <button {...baseProps} style={{ ...themeStyle, backgroundColor: 'var(--primary-color)' }} className="px-5 py-2 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition-opacity">{props.label}</button>;
    case "card": return <div {...baseProps} className="bg-white/10 p-6 rounded-xl shadow-lg backdrop-blur-sm border border-white/20"> {props.title && <h3 className="text-xl font-bold mb-2 text-white">{props.title}</h3>} {props.description && <p className="text-gray-200">{props.description}</p>}</div>;
    case "image": return <img {...props} className="max-w-full max-h-full object-contain rounded-lg shadow-lg"/>;
    case "video": return <video controls {...props} className="max-w-full max-h-full object-contain rounded-lg shadow-lg"/>;
    case "file-upload": return (
        <div className="bg-white/10 p-6 rounded-xl shadow-lg backdrop-blur-sm border border-white/20 text-center">
            <label htmlFor={elem.id} className="cursor-pointer">
                <h3 className="text-xl font-bold mb-2 text-white">{props.title || 'Upload File'}</h3>
                <p className="text-gray-200 mb-4">{props.description || 'Select a file to continue'}</p>
                <div className="w-full p-3 bg-white/5 rounded-lg border-2 border-dashed border-white/30 text-gray-300">Click to upload</div>
            </label>
            <input type="file" id={elem.id} className="hidden" onChange={handleFileChange} accept={props.accept || "*/*"} />
        </div>
    );
    case "search-result": return (
        <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/20">
            <a href={props.uri} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-blue-300 hover:underline">{props.title}</a>
            <p className="text-gray-300 mt-1">{props.snippet}</p>
        </div>
    );
    default: return null;
  }
};


export const ProceduralUIRenderer: React.FC<ProceduralUIRendererProps> = ({ spec, onElementClick, personalizations }) => {
  if (!spec) {
    return (
        <div className="w-full h-full flex items-center justify-center">
            <p className="text-gray-400">Waiting for UI command...</p>
        </div>
    );
  }
  
  const personalizedSpec = { ...spec };
  if (personalizations.preferredColor) {
    personalizedSpec.theme.colors.primary = personalizations.preferredColor;
  }

  const layoutClassName = getLayoutClassName(personalizedSpec.layout);

  return (
    <div
      className={`w-full h-full p-4 overflow-auto ${layoutClassName}`}
      style={{
        gap: `${personalizedSpec.theme.spacing}px`,
        fontFamily: personalizedSpec.theme.typography.family,
        backgroundColor: personalizedSpec.theme.colors.background,
        borderRadius: `${personalizedSpec.theme.borderRadius}px`,
      }}
    >
      {personalizedSpec.elements.map((elem) => {
        if (personalizedSpec.layout === 'floating') {
          return (
            <div
              key={elem.id}
              className={`absolute ${getAnimationClassName(elem.animation)}`}
              style={{
                left: `${elem.position.x}%`,
                top: `${elem.position.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <RenderedElement elem={elem} onClick={onElementClick} theme={personalizedSpec.theme} />
            </div>
          );
        }
        return (
            <div key={elem.id} className={`${getAnimationClassName(elem.animation)}`}>
              <RenderedElement elem={elem} onClick={onElementClick} theme={personalizedSpec.theme} />
            </div>
        )
      })}
    </div>
  );
};