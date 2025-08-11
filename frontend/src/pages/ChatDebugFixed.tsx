import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader2, Heart, ChevronRight } from 'lucide-react';

interface DynamicPrompt {
  text: string;
  action: string;
  value: any;
}

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  timestamp: Date;
  products?: any[];
  rainforestProducts?: any[];
  dynamicPrompts?: DynamicPrompt[];
  searchId?: string;
}

interface DebugInfo {
  timestamp: string;
  step: string;
  data: any;
}

interface Session {
  sessionId: string;
  userAge: number;
  userGender: string;
}

const ChatDebug: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugInfo[]>([]);
  const [heartedItems, setHeartedItems] = useState<Set<string>>(new Set());
  const [lastSearchId, setLastSearchId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const debugEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    debugEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, debugLogs]);

  const addDebugLog = (step: string, data: any) => {
    setDebugLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      step,
      data
    }]);
  };

  const startChat = async () => {
    try {
      addDebugLog('Starting Chat', { endpoint: 'http://localhost:9000/api/v1/chat/start' });
      
      const response = await fetch('http://localhost:9000/api/v1/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userAge: 25,
          userGender: 'MALE'
        })
      });

      const data = await response.json();
      addDebugLog('Chat Start Response', data);

      if (data.success) {
        setSession(data.session);
        addDebugLog('Session Created', data.session);
        
        // Load hearted items for this session
        try {
          const heartResponse = await fetch(`http://localhost:9000/api/v1/heart/${data.session.sessionId}`);
          const heartData = await heartResponse.json();
          if (heartData.success && heartData.heartedItems) {
            const heartedIds = heartData.heartedItems.map((item: any) => item.id || item.asin);
            setHeartedItems(new Set(heartedIds));
            addDebugLog('Hearted Items Loaded', { count: heartedIds.length });
          }
        } catch (error) {
          console.error('Failed to load hearted items:', error);
        }
        
        // Handle welcomeMessage - it might be an object or a string
        let welcomeContent = '';
        let welcomeProducts = [];
        
        if (typeof data.welcomeMessage === 'string') {
          welcomeContent = data.welcomeMessage;
        } else if (data.welcomeMessage && typeof data.welcomeMessage === 'object') {
          // Extract message content from the response object
          welcomeContent = data.welcomeMessage.message || data.welcomeMessage.content || '';
          welcomeProducts = data.welcomeMessage.products || data.welcomeMessage.suggestedProducts || [];
        }
        
        const welcomeMsg: Message = {
          id: 'welcome',
          role: 'ASSISTANT',
          content: welcomeContent,
          products: welcomeProducts,
          timestamp: new Date()
        };
        
        setMessages([welcomeMsg]);
        addDebugLog('Welcome Message Set', { content: welcomeContent, products: welcomeProducts });
      }
    } catch (error) {
      addDebugLog('Chat Start Error', { error: String(error) });
      console.error('Failed to start chat:', error);
    }
  };

  // Heart/Unheart functionality
  const toggleHeart = async (product: any) => {
    if (!session) return;
    
    const productId = product.id || product.asin;
    const isHearted = heartedItems.has(productId);
    
    try {
      if (isHearted) {
        // Unheart item
        const response = await fetch('http://localhost:9000/api/v1/heart', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            productId
          })
        });
        
        if (response.ok) {
          setHeartedItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(productId);
            return newSet;
          });
          addDebugLog('💔 Item Unhearted', { productId, title: product.title });
        }
      } else {
        // Heart item
        const response = await fetch('http://localhost:9000/api/v1/heart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session.sessionId,
            product
          })
        });
        
        if (response.ok) {
          setHeartedItems(prev => new Set([...prev, productId]));
          addDebugLog('❤️ Item Hearted', { productId, title: product.title });
        }
      }
    } catch (error) {
      console.error('Failed to toggle heart:', error);
      addDebugLog('Heart Toggle Error', { error: String(error) });
    }
  };

  // Handle dynamic prompt clicks
  const handlePromptClick = async (prompt: DynamicPrompt) => {
    if (!session || !lastSearchId) return;
    
    setIsLoading(true);
    addDebugLog('🔍 Applying Filter', { action: prompt.action, value: prompt.value });
    
    try {
      const response = await fetch('http://localhost:9000/api/v1/filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          searchId: lastSearchId,
          action: prompt.action,
          value: prompt.value
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        const filteredMsg: Message = {
          id: `filtered_${Date.now()}`,
          role: 'ASSISTANT',
          content: data.message,
          products: data.products || [],
          dynamicPrompts: data.dynamicPrompts || [],
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, filteredMsg]);
        addDebugLog('✅ Filter Applied', { 
          originalCount: data.originalCount,
          filteredCount: data.filteredCount 
        });
      }
    } catch (error) {
      console.error('Failed to apply filter:', error);
      addDebugLog('Filter Error', { error: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!currentMessage.trim() || !session) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'USER',
      content: currentMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    addDebugLog('User Message Sent', { message: currentMessage });
    
    const messageToSend = currentMessage;
    setCurrentMessage('');
    setIsLoading(true);

    try {
      addDebugLog('Sending to Backend', {
        sessionId: session.sessionId,
        message: messageToSend,
        endpoint: 'http://localhost:9000/api/v1/chat/message'
      });

      const response = await fetch('http://localhost:9000/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          message: messageToSend
        })
      });

      const data = await response.json();
      addDebugLog('Raw Backend Response', data);

      // Show detailed debug information
      if (data.debug) {
        addDebugLog('🤖 AI Product Extraction', data.debug.extractedProduct);
        addDebugLog('🔍 Search Keywords Used', data.debug.searchKeywords);
        addDebugLog('📝 Prompt Template', data.debug.promptUsed);
        addDebugLog('⚡ Search Strategy', data.debug.searchStrategy);
        addDebugLog('⏱️ Processing Time', `${data.debug.processingTime}ms`);
      }

      if (data.success) {
        // Handle both old and new backend response formats
        const response = data.response || data;
        const content = response.content || response.message || '';
        const products = response.suggestedProducts || response.products || [];
        
        // Store searchId if present
        if (response.searchId) {
          setLastSearchId(response.searchId);
        }
        
        const assistantMsg: Message = {
          id: `assistant_${Date.now()}`,
          role: 'ASSISTANT',
          content: typeof content === 'string' ? content : JSON.stringify(content),
          products: Array.isArray(products) ? products : [],
          rainforestProducts: Array.isArray(response.rainforestProducts) ? response.rainforestProducts : [],
          dynamicPrompts: response.dynamicPrompts || [],
          searchId: response.searchId,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMsg]);
        addDebugLog('📦 Final Product Results', {
          localProducts: assistantMsg.products?.length || 0,
          rainforestProducts: assistantMsg.rainforestProducts?.length || 0,
          localProductTitles: assistantMsg.products?.map((p: any) => p.title) || [],
          rainforestProductTitles: assistantMsg.rainforestProducts?.map((p: any) => p.title) || []
        });
      } else {
        // Handle error response
        const errorMsg: Message = {
          id: `error_${Date.now()}`,
          role: 'ASSISTANT',
          content: `Error: ${data.error || 'Failed to get response'}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (error) {
      addDebugLog('Send Message Error', { error: String(error) });
      console.error('Failed to send message:', error);
      
      // Add error message to chat
      const errorMsg: Message = {
        id: `error_${Date.now()}`,
        role: 'ASSISTANT',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Start chat on component mount
  useEffect(() => {
    startChat();
  }, []);

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Left Panel - Chat Interface */}
      <div className="w-1/2 flex flex-col bg-white border-r border-gray-200">
        <div className="bg-blue-600 text-white p-4">
          <h1 className="text-xl font-bold">Chat Debug - GottaEarn.it</h1>
          <p className="text-blue-100">Testing AI Product Recognition</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-2xl px-6 py-4 rounded-lg ${
                message.role === 'USER' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {message.role === 'USER' ? <User size={16} /> : <Bot size={16} />}
                  <span className="text-xs opacity-75">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap">
                  {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                </div>
                
                {/* Product Cards */}
                {message.products && Array.isArray(message.products) && message.products.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold">Local Products Found:</p>
                    {message.products.map((product: any, index: number) => (
                      <div key={`${product.id}-${index}`} className="bg-white p-4 rounded border shadow-sm flex gap-3">
                        {/* Product Image */}
                        {(product.imageUrl || product.image) && (
                          <img 
                            src={product.imageUrl || product.image} 
                            alt={product.title}
                            className="w-20 h-20 object-cover rounded flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-gray-800 mb-1">{product.title}</h4>
                          <p className="text-green-600 font-bold text-lg">${product.price}</p>
                          <p className="text-xs text-gray-500">Source: {product.source}</p>
                        </div>
                        <button
                          onClick={() => toggleHeart(product)}
                          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                          title={heartedItems.has(product.id || product.asin) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart
                            size={20}
                            className={heartedItems.has(product.id || product.asin) ? "text-red-500 fill-red-500" : "text-gray-400"}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {message.rainforestProducts && Array.isArray(message.rainforestProducts) && message.rainforestProducts.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <p className="text-xs font-semibold">Rainforest API Products:</p>
                    {message.rainforestProducts.map((product: any, index: number) => (
                      <div key={`rf-${product.asin}-${index}`} className="bg-yellow-50 p-4 rounded border shadow-sm flex gap-3">
                        {/* Product Image */}
                        {(product.imageUrl || product.image) && (
                          <img 
                            src={product.imageUrl || product.image} 
                            alt={product.title}
                            className="w-20 h-20 object-cover rounded flex-shrink-0"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-gray-800 mb-1">{product.title}</h4>
                          <p className="text-green-600 font-bold text-lg">${product.price}</p>
                          <p className="text-xs text-gray-500">Source: Rainforest API</p>
                        </div>
                        <button
                          onClick={() => toggleHeart(product)}
                          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                          title={heartedItems.has(product.id || product.asin) ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart
                            size={20}
                            className={heartedItems.has(product.id || product.asin) ? "text-red-500 fill-red-500" : "text-gray-400"}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dynamic Prompts */}
                {message.dynamicPrompts && message.dynamicPrompts.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold mb-2">Refine your search:</p>
                    <div className="flex flex-wrap gap-2">
                      {message.dynamicPrompts.map((prompt: DynamicPrompt, idx: number) => (
                        <button
                          key={idx}
                          onClick={() => handlePromptClick(prompt)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-xs font-medium transition-colors"
                          disabled={isLoading}
                        >
                          <ChevronRight size={14} />
                          {prompt.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input at bottom like GPT */}
        <div className="border-t border-gray-200 p-6">
          <div className="flex gap-3">
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Message ChatBot..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !currentMessage.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel - Debug Information */}
      <div className="w-1/2 flex flex-col bg-gray-900 text-green-400">
        <div className="bg-gray-800 text-white p-4">
          <h2 className="text-xl font-bold">🔍 AI Debug Console</h2>
          <p className="text-gray-300">Real-time AI processing logs</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm">
          {debugLogs.map((log, index) => (
            <div key={index} className="border-l-2 border-green-500 pl-4 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-yellow-400 font-bold">[{log.timestamp}]</span>
                <span className="text-blue-400 font-semibold">{log.step}</span>
              </div>
              <pre className="text-green-300 text-xs whitespace-pre-wrap overflow-x-auto bg-gray-800 p-2 rounded">
                {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
              </pre>
            </div>
          ))}
          <div ref={debugEndRef} />
        </div>

        {/* Session Info */}
        {session && (
          <div className="border-t border-gray-700 p-4 bg-gray-800">
            <h3 className="text-white font-bold mb-2">Session Info</h3>
            <div className="text-xs space-y-1">
              <p><span className="text-yellow-400">ID:</span> {session.sessionId}</p>
              <p><span className="text-yellow-400">Age:</span> {session.userAge}</p>
              <p><span className="text-yellow-400">Gender:</span> {session.userGender}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatDebug;
