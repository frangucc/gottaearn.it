import React, { useState, useEffect, useRef } from 'react';
import { Send, ShoppingBag, Star, ExternalLink, Heart, Sparkles } from 'lucide-react';

interface Message {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
  timestamp: Date;
  products?: Product[];
  rainforestProducts?: RainforestProduct[];
}

interface Product {
  id: string;
  title: string;
  price: number;
  formattedPrice: string;
  imageUrl: string;
  rating: number;
  ratingsTotal: number;
  recommendationReason?: string;
  matchScore?: number;
  cleanTitle?: string;
}

interface RainforestProduct {
  id: string;
  title: string;
  price: number;
  formattedPrice: string;
  imageUrl: string;
  rating: number;
  ratingsTotal: number;
  url: string;
  asin: string;
  isExternal: true;
}

interface ChatSession {
  sessionId: string;
  userAge?: number;
  userGender?: 'MALE' | 'FEMALE' | 'UNISEX';
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
}

const ENGAGING_PROMPTS = [
  "What's something cool you've been wanting lately? 🎮⚡",
  "Is there anything you've been saving up to buy? 💫",
  "What would make your day awesome right now? 🔥",
  "Any tech gadgets catching your eye? 📱💻",
  "What's on your wishlist that you're excited about? ⭐",
  "Anything you've been dreaming of getting? 🎯",
  "What would be the perfect reward for all your hard work? 🏆",
];

export const ChatBot: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Start chat session
  const startChat = async (userAge?: number, userGender?: string) => {
    try {
      const response = await fetch('http://localhost:9000/api/v1/chat/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAge: userAge || 16,
          userGender: userGender || 'UNISEX',
          userId: `user_${Date.now()}`,
          preferences: {}
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setSession(data.session);
        setIsStarted(true);
        
        // Add welcome message
        const welcomeMsg: Message = {
          id: 'welcome',
          role: 'ASSISTANT',
          content: "Hey there! 👋 I'm here to help you discover awesome stuff you might want to earn! What's something you've been wanting lately? Maybe a new game, headphones, or something cool for your room? 🎮🎧✨",
          timestamp: new Date()
        };
        
        setMessages([welcomeMsg]);
      }
    } catch (error) {
      console.error('Failed to start chat:', error);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!currentMessage.trim() || !session) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      role: 'USER',
      content: currentMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setCurrentMessage('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:9000/api/v1/chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          message: currentMessage
        })
      });

      const data = await response.json();

      if (data.success) {
        const assistantMsg: Message = {
          id: `assistant_${Date.now()}`,
          role: 'ASSISTANT',
          content: data.response.content,
          products: data.response.suggestedProducts,
          rainforestProducts: data.response.rainforestProducts,
          timestamp: new Date()
        };

        setMessages(prev => [...prev, assistantMsg]);

        // After a short delay, ask another engaging question
        setTimeout(() => {
          const randomPrompt = ENGAGING_PROMPTS[Math.floor(Math.random() * ENGAGING_PROMPTS.length)];
          const followUpMsg: Message = {
            id: `followup_${Date.now()}`,
            role: 'ASSISTANT',
            content: `That's awesome! ${randomPrompt}`,
            timestamp: new Date()
          };
          setMessages(prev => [...prev, followUpMsg]);
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMsg: Message = {
        id: `error_${Date.now()}`,
        role: 'ASSISTANT',
        content: "Oops! Something went wrong. Can you try again? 🤔",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  // Log product interaction
  const logProductInteraction = async (productId: string, type: string, messageId: string) => {
    if (!session) return;

    try {
      await fetch('http://localhost:9000/api/v1/chat/interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.sessionId,
          messageId,
          type,
          productId,
          data: { timestamp: new Date().toISOString() }
        })
      });
    } catch (error) {
      console.error('Failed to log interaction:', error);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Age selection screen
  if (!isStarted) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="mb-6">
            <Sparkles className="w-16 h-16 text-purple-500 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Discover Cool Stuff to Earn! 🚀
            </h2>
            <p className="text-gray-600">
              I'll help you find awesome products you might want to work towards earning!
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => startChat(16, 'MALE')}
                className="bg-blue-500 hover:bg-blue-600 text-white p-4 rounded-lg font-semibold transition-colors"
              >
                Teen Guy 🎮
              </button>
              <button
                onClick={() => startChat(16, 'FEMALE')}
                className="bg-pink-500 hover:bg-pink-600 text-white p-4 rounded-lg font-semibold transition-colors"
              >
                Teen Girl ✨
              </button>
            </div>
            
            <button
              onClick={() => startChat(19, 'UNISEX')}
              className="bg-purple-500 hover:bg-purple-600 text-white p-4 rounded-lg font-semibold transition-colors w-full"
            >
              Young Adult 🎯
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Chat Header */}
      <div className="bg-gradient-to-r from-purple-500 to-blue-600 text-white p-4">
        <div className="flex items-center space-x-2">
          <ShoppingBag className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">Your Personal Shopping Assistant</h3>
            <p className="text-sm opacity-90">Find cool stuff to earn!</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="h-96 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id}>
            {/* Message bubble */}
            <div className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg p-3 ${
                message.role === 'USER' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-100 text-gray-900'
              }`}>
                <p className="text-sm">{message.content}</p>
              </div>
            </div>

            {/* Product cards */}
            {(message.products || message.rainforestProducts) && (
              <div className="mt-3 space-y-3">
                {/* Database products */}
                {message.products?.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onInteraction={(type) => logProductInteraction(product.id, type, message.id)}
                    source="database"
                  />
                ))}

                {/* Rainforest products */}
                {message.rainforestProducts?.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product as any}
                    onInteraction={(type) => logProductInteraction(product.id, type, message.id)}
                    source="rainforest"
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Tell me what you're wanting..."
            className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !currentMessage.trim()}
            className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white p-2 rounded-lg transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Product Card Component
const ProductCard: React.FC<{
  product: Product | RainforestProduct;
  onInteraction: (type: string) => void;
  source: 'database' | 'rainforest';
}> = ({ product, onInteraction, source }) => {
  const [isFavorited, setIsFavorited] = useState(false);

  const handleFavorite = () => {
    setIsFavorited(!isFavorited);
    onInteraction(isFavorited ? 'PRODUCT_UNFAVORITE' : 'PRODUCT_FAVORITE');
  };

  const handleClick = () => {
    onInteraction('PRODUCT_CLICK');
    if (source === 'rainforest' && 'url' in product) {
      window.open(product.url, '_blank');
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex space-x-4">
        {/* Product Image */}
        <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="w-8 h-8 text-gray-400" />
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm line-clamp-2 mb-1">
            {'cleanTitle' in product ? product.cleanTitle : product.title}
          </h4>
          
          <div className="flex items-center space-x-2 mb-2">
            <span className="font-bold text-lg text-green-600">
              {product.formattedPrice}
            </span>
            
            {product.rating && (
              <div className="flex items-center space-x-1">
                <Star className="w-4 h-4 text-yellow-400 fill-current" />
                <span className="text-sm text-gray-600">
                  {product.rating} ({product.ratingsTotal})
                </span>
              </div>
            )}
          </div>

          {/* Recommendation reason for database products */}
          {'recommendationReason' in product && product.recommendationReason && (
            <p className="text-xs text-purple-600 mb-2">
              💡 {product.recommendationReason}
            </p>
          )}

          {/* Source indicator */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {source === 'rainforest' ? '🌐 From Amazon' : '🏪 In our catalog'}
            </span>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={handleFavorite}
                className={`p-1 rounded transition-colors ${
                  isFavorited ? 'text-red-500' : 'text-gray-400 hover:text-red-500'
                }`}
              >
                <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
              
              <button
                onClick={handleClick}
                className="bg-purple-500 hover:bg-purple-600 text-white text-xs px-3 py-1 rounded-full flex items-center space-x-1"
              >
                <span>View</span>
                {source === 'rainforest' && <ExternalLink className="w-3 h-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
