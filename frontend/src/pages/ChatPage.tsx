import React from 'react';
import { ChatBot } from '../components/ChatBot';

export const ChatPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 py-8">
      <div className="container mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            GottaEarn.it Chat 💬
          </h1>
          <p className="text-lg text-gray-600">
            Discover awesome products you can work towards earning!
          </p>
        </div>
        
        <ChatBot />
      </div>
    </div>
  );
};
