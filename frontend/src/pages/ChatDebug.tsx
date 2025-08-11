import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Bot, Loader2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  timestamp: Date;
  products?: any[];
  rainforestProducts?: any[];
}

interface DebugInfo {
  timestamp: string;
  step: string;
  data: any;
  type?: 'info' | 'error' | 'warning' | 'success';
  isError?: boolean;
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [debugLogs, setDebugLogs] = useState<DebugInfo[]>([]);
  const [selectedAge, setSelectedAge] = useState<number | null>(null);
  const [selectedGender, setSelectedGender] = useState<string | null>(null);
  const [showDemographics, setShowDemographics] = useState(true);
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const debugEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    debugEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, debugLogs]);

  const addDebugLog = (step: string, data: any, type: 'info' | 'error' | 'warning' | 'success' = 'info') => {
    const isError = type === 'error' || step.includes('Error') || step.includes('❌');
    setDebugLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      step,
      data,
      type,
      isError
    }]);
  };

  const toggleError = (index: number) => {
    setExpandedErrors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const startChat = async (age: number, gender: string) => {
    try {
      addDebugLog('Starting Chat Session', { age, gender });
      
      const response = await fetch('http://localhost:9000/api/v1/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userAge: 25,
          userGender: 'MALE'
        })
      });

      const data = await response.json();
      addDebugLog('Chat Session Response', data);

      if (data.success) {
        setSession(data.session);
        
        const welcomeMsg: Message = {
          id: 'welcome',
          role: 'ASSISTANT',
          content: data.welcomeMessage,
          timestamp: new Date()
        };
        
        setMessages([welcomeMsg]);
        addDebugLog('Welcome Message Set', welcomeMsg);
      }
    } catch (error) {
      addDebugLog('Chat Start Error', error);
      console.error('Failed to start chat:', error);
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
    setCurrentMessage('');
    setIsLoading(true);
    setIsProcessing(true);

    try {
      addDebugLog('Sending to Backend', {
        sessionId: session.sessionId,
        message: currentMessage,
        endpoint: 'http://localhost:9000/api/v1/chat/message'
      });

      const response = await fetch('http://localhost:9000/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          message: currentMessage
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
        // Handle the actual response structure from backend
        // Based on error, backend returns: {message, products, suggestions, messageId, ...}
        let content = data.message || data.response?.content || 'No response content';
        
        // Ensure content is always a string
        if (typeof content !== 'string') {
          content = JSON.stringify(content);
        }
        
        const products = Array.isArray(data.products) ? data.products : 
                        Array.isArray(data.response?.suggestedProducts) ? data.response.suggestedProducts : [];
        const rainforestProducts = Array.isArray(data.rainforestProducts) ? data.rainforestProducts :
                                  Array.isArray(data.response?.rainforestProducts) ? data.response.rainforestProducts : [];

        const assistantMsg: Message = {
          id: `assistant_${Date.now()}`,
          role: 'ASSISTANT',
          content: content,
          products: products,
          rainforestProducts: rainforestProducts,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMsg]);
        addDebugLog('📦 Final Product Results', {
          localProducts: products?.length || 0,
          rainforestProducts: rainforestProducts?.length || 0,
          localProductTitles: products?.map((p: any) => p.title) || [],
          rainforestProductTitles: rainforestProducts?.map((p: any) => p.title) || []
        });
      } else {
        // Handle error case
        addDebugLog('❌ Chat Response Error', {
          error: data.error,
          fullResponse: data
        }, 'error');
        
        // Add error message to chat
        const errorMsg: Message = {
          id: `error_${Date.now()}`,
          role: 'ASSISTANT',
          content: data.response?.content || data.error || 'I\'m having trouble right now. Could you try asking that again?',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } catch (error) {
      addDebugLog('❌ Network/Send Error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      }, 'error');
      console.error('Failed to send message:', error);
      
      // Add error message to chat
      const errorMsg: Message = {
        id: `error_${Date.now()}`,
        role: 'ASSISTANT',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to fetch'}`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Removed automatic chat start - user will select demographics first

  const handleStartChat = () => {
    if (selectedAge && selectedGender) {
      startChat(selectedAge, selectedGender);
      setShowDemographics(false);
    }
  };

  return (
    <div className="h-screen flex bg-gray-50">
      {/* Left Panel - Chat Interface */}
      <div className="w-1/2 flex flex-col bg-white border-r border-gray-200">
        <div className="bg-blue-600 text-white p-4">
          <h1 className="text-xl font-bold">Chat Debug - GottaEarn.it</h1>
          <p className="text-blue-100">Testing AI Product Recognition</p>
        </div>

        {/* Demographic Selection */}
        {showDemographics && !session && (
          <div className="p-6 bg-gray-50 border-b">
            <h2 className="text-lg font-semibold mb-4">Select Demographics</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Age Range</label>
                <div className="grid grid-cols-2 gap-2">
                  {[13, 16, 19, 21].map(age => (
                    <button
                      key={age}
                      onClick={() => setSelectedAge(age)}
                      className={`p-2 rounded border text-sm ${
                        selectedAge === age 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {age} years
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Gender</label>
                <div className="grid grid-cols-2 gap-2">
                  {['MALE', 'FEMALE'].map(gender => (
                    <button
                      key={gender}
                      onClick={() => setSelectedGender(gender)}
                      className={`p-2 rounded border text-sm ${
                        selectedGender === gender 
                          ? 'bg-blue-600 text-white border-blue-600' 
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {gender}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handleStartChat}
                disabled={!selectedAge || !selectedGender}
                className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Start Chat Session
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                message.role === 'USER' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {message.role === 'USER' ? <User size={16} /> : <Bot size={16} />}
                  <span className="text-xs opacity-75">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">
                  {typeof message.content === 'string' ? message.content : JSON.stringify(message.content)}
                </p>
                
                {/* Product Cards */}
                {message.products && message.products.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold">Local Products Found:</p>
                    {message.products.map((product, index) => (
                      <div key={`${product.id}-${index}`} className="bg-white p-3 rounded border flex gap-3">
                        {/* Product Image */}
                        {(product.imageUrl || product.image) && (
                          <img 
                            src={product.imageUrl || product.image} 
                            alt={product.title}
                            className="w-20 h-20 object-contain rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-gray-800 line-clamp-2">{product.title}</h4>
                          <p className="text-green-600 font-bold">${product.price || product.formattedPrice}</p>
                          <p className="text-xs text-gray-500">Source: Local Database</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {message.rainforestProducts && message.rainforestProducts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold">Rainforest API Products:</p>
                    {message.rainforestProducts.map((product, index) => (
                      <div key={`rf-${product.id || product.asin}-${index}`} className="bg-yellow-50 p-3 rounded border flex gap-3">
                        {/* Product Image */}
                        {(product.imageUrl || product.image) && (
                          <img 
                            src={product.imageUrl || product.image} 
                            alt={product.title}
                            className="w-20 h-20 object-contain rounded"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm text-gray-800 line-clamp-2">{product.title}</h4>
                          <p className="text-green-600 font-bold">${product.price || product.formattedPrice}</p>
                          <p className="text-xs text-gray-500">Source: Rainforest API</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !currentMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm">
          {/* Loading indicator */}
          {isProcessing && (
            <div className="flex items-center gap-2 text-cyan-400 animate-pulse mb-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing request...</span>
            </div>
          )}
          
          {debugLogs.map((log, index) => {
            const isExpanded = expandedErrors.has(index);
            const isError = log.isError || log.type === 'error';
            
            return (
              <div key={index} className={`border-l-2 ${isError ? 'border-red-500' : 'border-green-500'} pl-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-yellow-400 font-bold">[{log.timestamp}]</span>
                  {isError && (
                    <button
                      onClick={() => toggleError(index)}
                      className="flex items-center gap-1 text-red-400 hover:text-red-300"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <AlertCircle className="w-3 h-3" />
                    </button>
                  )}
                  <span className={isError ? 'text-red-400' : 'text-blue-400'}>{log.step}</span>
                </div>
                
                {/* For errors, show collapsed/expanded view */}
                {isError ? (
                  <div className="text-red-300 text-xs">
                    {!isExpanded ? (
                      <div className="cursor-pointer hover:text-red-200" onClick={() => toggleError(index)}>
                        {typeof log.data === 'object' && log.data.error 
                          ? `Error: ${log.data.error}` 
                          : 'Click to expand error details'}
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap overflow-x-auto bg-red-950 p-2 rounded mt-1">
                        {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                      </pre>
                    )}
                  </div>
                ) : (
                  <pre className="text-green-300 text-xs whitespace-pre-wrap overflow-x-auto">
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
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
