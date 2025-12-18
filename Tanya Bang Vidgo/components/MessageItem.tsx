import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../types';
import { Copy, Check, Clipboard, Sparkles, Zap } from 'lucide-react';

interface MessageItemProps {
  message: Message;
  instant?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message, instant }) => {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [displayedLength, setDisplayedLength] = useState(
    isUser || instant ? message.content.length : 0
  );

  useEffect(() => {
    if (isUser || instant) {
      setDisplayedLength(message.content.length);
      return;
    }

    if (!message.content) {
      return;
    }

    const interval = setInterval(() => {
      setDisplayedLength((prev) => {
        if (prev >= message.content.length) {
          clearInterval(interval);
          return message.content.length;
        }
        return prev + 3;
      });
    }, 20);

    return () => clearInterval(interval);
  }, [message.content, isUser, instant]);

  const handleCopy = () => {
    // Basic Markdown Stripper for Cleaner Copy
    const cleanText = message.content
      // Headers: Remove #, ##, ### but keep text
      .replace(/^#{1,6}\s+(.*)$/gm, '$1')
      // Bold/Italic: Remove **, *, __, _ but keep text
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Strikethrough: Remove ~~
      .replace(/~~(.*?)~~/g, '$1')
      // Links: [Text](url) -> Text (url) or just Text. Let's keep just Text for cleanliness
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Blockquotes: Remove > 
      .replace(/^>\s+/gm, '')
      // Code Blocks: Remove ```lang
      .replace(/```[\w]*\n?/g, '')
      // Inline Code: Remove `
      .replace(/`([^`]+)`/g, '$1')
      // Lists: Keep markers but ensure spacing is clean? 
      // Actually lists are fine in plain text usually.
      // Images: ![Alt](url) -> [Image: Alt]
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[Image: $1]')
      // Horizontal Rules
      .replace(/^-{3,}/gm, '---');

    navigator.clipboard.writeText(cleanText.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group w-full text-gray-100 border-b border-black/5 dark:border-white/5 ${isUser ? 'bg-transparent' : 'bg-transparent'}`}>
      <div className="m-auto md:max-w-3xl p-4 md:py-6 flex gap-4 md:gap-6">
        
        {/* Avatar Area */}
        <div className="flex-shrink-0 flex flex-col relative items-end">
          <div className={`
            w-8 h-8 rounded-lg flex items-center justify-center shadow-lg
            ${isUser 
              ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-purple-500/20' 
              : 'bg-gradient-to-br from-orange-400 to-red-600 shadow-orange-500/20'
            }
          `}>
            {isUser ? (
              <Sparkles size={16} className="text-white fill-white/20" />
            ) : (
              <Zap size={16} className="text-white fill-white/20" />
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="relative flex-1 overflow-hidden min-w-0">
          {/* Label Name */}
          <div className="flex items-center gap-2 mb-1 select-none">
            <span className={`font-bold text-sm ${isUser ? 'text-indigo-300' : 'text-orange-400'}`}>
              {isUser ? 'Creator' : 'Bang Vidgo'}
            </span>
            {!isUser && (
              <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-1.5 py-0.5 rounded font-medium">
                AI
              </span>
            )}
          </div>

          <div className="prose prose-invert max-w-none leading-relaxed text-[15px] break-words">
            {/* Loading Indicator for empty assistant message */}
          {!isUser && !message.content ? (
              <div className="flex items-center gap-1.5 h-7">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-75"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-150"></div>
              </div>
            ) : (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Headings
                  h1: ({children}) => <h1 className="text-2xl font-bold mt-8 mb-4 text-white border-b border-gray-700 pb-2">{children}</h1>,
                  h2: ({children}) => <h2 className="text-xl font-bold mt-6 mb-3 text-orange-400">{children}</h2>,
                  h3: ({children}) => <h3 className="text-lg font-bold mt-5 mb-2 text-gray-100">{children}</h3>,
                  
                  // Text formatting
                  strong: ({children}) => <strong className="font-bold text-white">{children}</strong>,
                  p: ({children}) => <p className="mb-4 last:mb-0 text-gray-300 leading-7 whitespace-pre-wrap">{children}</p>,
                  
                  // Separator (HR)
                  hr: () => <hr className="my-6 border-t border-gray-700/80" />,

                  // Lists
                  ul: ({children}) => <ul className="list-disc pl-5 mb-4 space-y-2 text-gray-300">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal pl-5 mb-4 space-y-2 text-gray-300">{children}</ol>,
                  li: ({children}) => <li className="pl-1 leading-7">{children}</li>,
                  
                  // Blockquotes (Enhanced with Copy Button for Captions/Prompts)
                  blockquote: ({children}) => <BlockquoteWithCopy>{children}</BlockquoteWithCopy>,

                  // Links
                  a: ({href, children}) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300 hover:underline decoration-orange-400/30 underline-offset-2 break-all">
                      {children}
                    </a>
                  ),

                  // Code Blocks
                  code({node, inline, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : '';
                    const codeString = String(children).replace(/\n$/, '');

                    if (!inline && match) {
                      return (
                        <div className="my-6 rounded-lg overflow-hidden border border-gray-700 bg-[#0d0d0d] shadow-lg">
                          <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-gray-700">
                            <span className="text-xs font-mono text-gray-400 lowercase">{language}</span>
                            <CopyButton textToCopy={codeString} label="Code" />
                          </div>
                          <div className="overflow-x-auto">
                            <SyntaxHighlighter
                              style={vscDarkPlus}
                              language={language}
                              PreTag="div"
                              customStyle={{ margin: 0, padding: '1rem', background: 'transparent' }}
                              {...props}
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          </div>
                        </div>
                      );
                    }

                    // Inline Code
                    return (
                      <code className="bg-gray-700/40 text-gray-200 px-1.5 py-0.5 rounded text-sm font-mono border border-gray-700/50 break-words" {...props}>
                        {children}
                      </code>
                    );
                  }
                }}
              >
                {isUser || instant ? message.content : message.content.slice(0, displayedLength)}
              </ReactMarkdown>
            )}
          </div>
          
          {isUser && Array.isArray(message.images) && message.images.length > 0 && (
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              {message.images.slice(0, 4).map((src, idx) => (
                <a key={idx} href={src} target="_blank" rel="noopener noreferrer" className="block">
                  <img src={src} alt="" className="w-32 h-32 object-cover rounded-lg border border-gray-700" />
                </a>
              ))}
            </div>
          )}

          {/* Actions (visible on hover for assistant) */}
          {!isUser && message.content && (
            <div className="flex items-center gap-2 mt-4 pt-2 border-t border-transparent">
              <button 
                onClick={handleCopy}
                className="flex items-center gap-1.5 p-1 text-gray-400 hover:text-gray-200 text-xs font-medium transition-colors"
              >
                {copied ? <Check size={14} /> : <Clipboard size={14} />}
                {copied ? 'Salin Semua' : 'Salin'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Component khusus untuk Quote/Caption dengan tombol copy
const BlockquoteWithCopy = ({ children }: { children?: React.ReactNode }) => {
  const quoteRef = useRef<HTMLQuoteElement>(null);
  const [isCopied, setIsCopied] = useState(false);

  const copyQuote = () => {
    if (quoteRef.current) {
      navigator.clipboard.writeText(quoteRef.current.innerText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="relative group/quote my-6">
      <blockquote 
        ref={quoteRef}
        className="border-l-4 border-orange-500/50 pl-4 py-3 bg-gray-800/50 italic text-gray-300 rounded-r-lg"
      >
        {children}
      </blockquote>
      <button
        onClick={copyQuote}
        className="absolute top-2 right-2 p-1.5 bg-gray-700/80 hover:bg-orange-600 rounded-md text-gray-300 hover:text-white transition-all opacity-0 group-hover/quote:opacity-100 shadow-sm backdrop-blur-sm"
        title="Salin Teks"
      >
        {isCopied ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
};

// Helper component for the code block copy button
const CopyButton = ({ textToCopy, label = "Code" }: { textToCopy: string, label?: string }) => {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(textToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <button 
      onClick={copyToClipboard} 
      className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
    >
      {isCopied ? (
        <>
          <Check size={12} /> Copied!
        </>
      ) : (
        <>
          <Clipboard size={12} /> Copy {label}
        </>
      )}
    </button>
  );
};
