import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class ConversationLogger {
  constructor() {
    this.batchSize = 10;
    this.pendingLogs = [];
    this.flushInterval = null;
    this.startBatchProcessor();
  }

  /**
   * Log a chat message with full context
   */
  async logMessage(chatSessionId, role, content, metadata = {}) {
    try {
      const message = await prisma.chatMessage.create({
        data: {
          chatSessionId,
          role,
          content,
          promptUsed: metadata.promptUsed,
          contextData: metadata.contextData,
          aiModel: metadata.aiModel,
          tokens: metadata.tokens,
          responseTime: metadata.responseTime
        }
      });

      // Log to console for real-time monitoring
      this.logToConsole(chatSessionId, role, content, metadata);

      return message;

    } catch (error) {
      console.error('💬📝❌ Failed to log message:', error);
      // Fallback to batch logging
      this.addToBatch({
        type: 'message',
        chatSessionId,
        role,
        content,
        metadata,
        timestamp: new Date()
      });
      return null;
    }
  }

  /**
   * Log user interaction (product clicks, favorites, etc.)
   */
  async logInteraction(chatSessionId, interaction) {
    try {
      const logged = await prisma.chatInteraction.create({
        data: {
          chatSessionId,
          messageId: interaction.messageId,
          type: interaction.type,
          productId: interaction.productId,
          segmentId: interaction.segmentId,
          data: interaction.data
        }
      });

      // Log to console for real-time monitoring
      console.log(`💬🔍 ${interaction.type}: ${JSON.stringify({
        session: chatSessionId.slice(-8),
        product: interaction.productId?.slice(-8),
        data: interaction.data
      })}`);

      return logged;

    } catch (error) {
      console.error('💬🔍❌ Failed to log interaction:', error);
      this.addToBatch({
        type: 'interaction',
        chatSessionId,
        interaction,
        timestamp: new Date()
      });
      return null;
    }
  }

  /**
   * Log conversation analytics event
   */
  async logAnalyticsEvent(sessionId, eventType, data = {}) {
    const event = {
      sessionId,
      eventType,
      data: {
        ...data,
        timestamp: new Date().toISOString(),
        userAgent: data.userAgent || 'unknown'
      }
    };

    // Store in interaction with special type
    return this.logInteraction(sessionId, {
      type: 'CONVERSATION_ANALYTICS',
      data: event
    });
  }

  /**
   * Start a conversation session with initial context
   */
  async logSessionStart(chatSession, initialContext = {}) {
    const startLog = {
      sessionId: chatSession.sessionId,
      userId: chatSession.userId,
      userAge: chatSession.userAge,
      userGender: chatSession.userGender,
      initialContext,
      timestamp: new Date().toISOString()
    };

    console.log(`💬🚀 Session started: ${JSON.stringify({
      session: chatSession.sessionId.slice(-12),
      user: chatSession.userId.slice(-8),
      age: chatSession.userAge,
      gender: chatSession.userGender
    })}`);

    return this.logInteraction(chatSession.id, {
      type: 'SESSION_START',
      data: startLog
    });
  }

  /**
   * Log conversation end with summary analytics
   */
  async logSessionEnd(sessionId, endReason = 'user_ended') {
    const session = await prisma.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: true,
        interactions: true
      }
    });

    if (!session) return null;

    const summary = this.generateSessionSummary(session);

    // Update session status
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { 
        status: endReason === 'abandoned' ? 'ABANDONED' : 'COMPLETED',
        context: {
          ...session.context,
          endReason,
          summary
        }
      }
    });

    console.log(`💬🏁 Session ended: ${JSON.stringify({
      session: sessionId.slice(-12),
      reason: endReason,
      messages: summary.messageCount,
      duration: summary.durationMinutes
    })}`);

    return this.logInteraction(session.id, {
      type: 'SESSION_END',
      data: { endReason, summary }
    });
  }

  /**
   * Generate session summary for analytics
   */
  generateSessionSummary(session) {
    const messages = session.messages || [];
    const interactions = session.interactions || [];

    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const duration = firstMessage && lastMessage ? 
      new Date(lastMessage.createdAt) - new Date(firstMessage.createdAt) : 0;

    return {
      messageCount: messages.length,
      userMessages: messages.filter(m => m.role === 'USER').length,
      assistantMessages: messages.filter(m => m.role === 'ASSISTANT').length,
      interactionCount: interactions.length,
      productsViewed: interactions.filter(i => i.type === 'PRODUCT_CLICK').length,
      productsFavorited: interactions.filter(i => i.type === 'PRODUCT_FAVORITE').length,
      durationMs: duration,
      durationMinutes: Math.round(duration / 60000),
      avgResponseTime: this.calculateAvgResponseTime(messages),
      promptsUsed: [...new Set(messages.map(m => m.promptUsed).filter(Boolean))],
      aiTokensUsed: messages.reduce((total, m) => total + (m.tokens || 0), 0)
    };
  }

  /**
   * Calculate average AI response time
   */
  calculateAvgResponseTime(messages) {
    const responseTimes = messages
      .filter(m => m.role === 'ASSISTANT' && m.responseTime)
      .map(m => m.responseTime);
    
    if (responseTimes.length === 0) return 0;
    
    return Math.round(responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length);
  }

  /**
   * Log to console with emoji indicators for easy monitoring
   */
  logToConsole(sessionId, role, content, metadata) {
    const emoji = {
      'USER': '💭',
      'ASSISTANT': '🤖',
      'SYSTEM': '⚙️'
    }[role] || '💬';

    const shortContent = content.length > 100 ? 
      content.substring(0, 100) + '...' : content;

    const logData = {
      session: sessionId.slice(-8),
      role,
      content: shortContent,
      prompt: metadata.promptUsed,
      tokens: metadata.tokens,
      responseTime: metadata.responseTime
    };

    console.log(`${emoji} ${JSON.stringify(logData)}`);
  }

  /**
   * Add failed logs to batch for retry
   */
  addToBatch(logEntry) {
    this.pendingLogs.push(logEntry);
    
    if (this.pendingLogs.length >= this.batchSize) {
      this.flushBatch();
    }
  }

  /**
   * Start periodic batch processor
   */
  startBatchProcessor() {
    if (this.flushInterval) return;

    this.flushInterval = setInterval(() => {
      if (this.pendingLogs.length > 0) {
        this.flushBatch();
      }
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Flush pending logs to database
   */
  async flushBatch() {
    if (this.pendingLogs.length === 0) return;

    const batch = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      for (const entry of batch) {
        if (entry.type === 'message') {
          await this.logMessage(
            entry.chatSessionId,
            entry.role,
            entry.content,
            entry.metadata
          );
        } else if (entry.type === 'interaction') {
          await this.logInteraction(
            entry.chatSessionId,
            entry.interaction
          );
        }
      }
      
      console.log(`💬📝✅ Flushed ${batch.length} pending logs`);

    } catch (error) {
      console.error('💬📝❌ Batch flush failed:', error);
      // Re-add failed entries to pending (with limit to prevent infinite growth)
      this.pendingLogs = [...batch.slice(-50), ...this.pendingLogs];
    }
  }

  /**
   * Get conversation analytics for admin dashboard
   */
  async getConversationAnalytics(timeframe = '24h') {
    const now = new Date();
    const timeframeMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }[timeframe] || 24 * 60 * 60 * 1000;

    const since = new Date(now.getTime() - timeframeMs);

    // Get session metrics
    const sessions = await prisma.chatSession.findMany({
      where: { createdAt: { gte: since } },
      include: {
        messages: true,
        interactions: true,
        user: { select: { id: true, email: true } }
      }
    });

    // Get message metrics
    const messages = await prisma.chatMessage.findMany({
      where: { createdAt: { gte: since } },
      include: { chatSession: true }
    });

    // Get interaction metrics
    const interactions = await prisma.chatInteraction.findMany({
      where: { createdAt: { gte: since } },
      include: { 
        product: { select: { id: true, title: true, price: true } }
      }
    });

    return {
      timeframe,
      overview: {
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => s.status === 'ACTIVE').length,
        completedSessions: sessions.filter(s => s.status === 'COMPLETED').length,
        totalMessages: messages.length,
        totalInteractions: interactions.length,
        uniqueUsers: new Set(sessions.map(s => s.userId)).size
      },
      engagement: {
        avgMessagesPerSession: sessions.length > 0 ? 
          messages.length / sessions.length : 0,
        avgSessionDuration: this.calculateAvgSessionDuration(sessions),
        mostActiveHours: this.getMostActiveHours(messages),
        conversionRate: this.calculateConversionRate(sessions, interactions)
      },
      products: {
        totalProductViews: interactions.filter(i => i.type === 'PRODUCT_CLICK').length,
        totalFavorites: interactions.filter(i => i.type === 'PRODUCT_FAVORITE').length,
        mostViewedProducts: this.getMostViewedProducts(interactions),
        avgProductsPerSession: sessions.length > 0 ? 
          interactions.filter(i => i.productId).length / sessions.length : 0
      },
      ai: {
        totalTokensUsed: messages.reduce((sum, m) => sum + (m.tokens || 0), 0),
        avgResponseTime: this.calculateAvgResponseTime(messages),
        mostUsedPrompts: this.getMostUsedPrompts(messages),
        aiErrorRate: this.calculateAiErrorRate(messages)
      }
    };
  }

  /**
   * Calculate average session duration
   */
  calculateAvgSessionDuration(sessions) {
    const durations = sessions.map(session => {
      const messages = session.messages || [];
      if (messages.length < 2) return 0;
      
      const first = new Date(messages[0].createdAt);
      const last = new Date(messages[messages.length - 1].createdAt);
      return last - first;
    }).filter(d => d > 0);

    if (durations.length === 0) return 0;
    
    const avgMs = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    return Math.round(avgMs / 60000); // Convert to minutes
  }

  /**
   * Get most active hours of the day
   */
  getMostActiveHours(messages) {
    const hourCounts = {};
    
    messages.forEach(message => {
      const hour = new Date(message.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    return Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([hour, count]) => ({ hour: parseInt(hour), messageCount: count }));
  }

  /**
   * Calculate conversion rate (sessions with product interactions)
   */
  calculateConversionRate(sessions, interactions) {
    const sessionsWithInteractions = new Set(
      interactions
        .filter(i => i.type === 'PRODUCT_CLICK' || i.type === 'PRODUCT_FAVORITE')
        .map(i => i.chatSessionId)
    );

    return sessions.length > 0 ? 
      (sessionsWithInteractions.size / sessions.length * 100).toFixed(1) : 0;
  }

  /**
   * Get most viewed products
   */
  getMostViewedProducts(interactions) {
    const productViews = {};
    
    interactions
      .filter(i => i.type === 'PRODUCT_CLICK' && i.product)
      .forEach(interaction => {
        const productId = interaction.productId;
        if (!productViews[productId]) {
          productViews[productId] = {
            product: interaction.product,
            viewCount: 0
          };
        }
        productViews[productId].viewCount++;
      });

    return Object.values(productViews)
      .sort((a, b) => b.viewCount - a.viewCount)
      .slice(0, 10);
  }

  /**
   * Get most used prompt templates
   */
  getMostUsedPrompts(messages) {
    const promptCounts = {};
    
    messages
      .filter(m => m.promptUsed)
      .forEach(message => {
        promptCounts[message.promptUsed] = (promptCounts[message.promptUsed] || 0) + 1;
      });

    return Object.entries(promptCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([prompt, count]) => ({ prompt, usageCount: count }));
  }

  /**
   * Calculate AI error rate
   */
  calculateAiErrorRate(messages) {
    const aiMessages = messages.filter(m => m.role === 'ASSISTANT');
    const errorMessages = messages.filter(m => 
      m.role === 'SYSTEM' && m.content.includes('Error')
    );

    return aiMessages.length > 0 ? 
      (errorMessages.length / aiMessages.length * 100).toFixed(1) : 0;
  }

  /**
   * Get recent messages for a chat session
   */
  async getRecentMessages(chatSessionId, limit = 5) {
    try {
      const messages = await prisma.chatMessage.findMany({
        where: { chatSessionId },
        orderBy: { createdAt: 'desc' },
        take: limit
      });
      
      // Return in chronological order (oldest first)
      return messages.reverse();
    } catch (error) {
      console.error('💬📝❌ Failed to get recent messages:', error);
      return [];
    }
  }

  /**
   * Clean up old logs (for maintenance)
   */
  async cleanupOldLogs(daysToKeep = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: cutoffDate } }
    });

    console.log(`💬🧹 Cleaned up ${result.count} old chat messages`);
    return result.count;
  }

  /**
   * Stop batch processor
   */
  stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    
    // Flush any remaining logs
    this.flushBatch();
  }
}

export const conversationLogger = new ConversationLogger();
