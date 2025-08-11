import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class PromptTemplates {
  constructor() {
    this.templates = new Map();
    this.loadDefaultTemplates();
  }

  /**
   * Load default prompt templates into memory
   */
  loadDefaultTemplates() {
    const defaultTemplates = {
      greeting: {
        name: 'greeting',
        description: 'Initial greeting for new chat sessions',
        template: `You're the GottaEarn.it assistant helping {{userAge ? 'a ' + userAge + ' year old' : 'a young person'}}{{userGender === 'MALE' ? ' guy' : userGender === 'FEMALE' ? ' girl' : ''}} discover awesome things they can work towards earning!

Remember: At GottaEarn.it, we believe "You want something, you gotta earn it!" 💪

Your response should:
- Be enthusiastic and encouraging about earning rewards through hard work
- Use age-appropriate language
- Keep it under 50 words
- Focus on what they might want to earn (games, toys, tech, sports gear, etc.)

Start by asking: "Hey! What's something awesome you've been wanting lately? Maybe a new game, LEGO set, skateboard, or some cool tech? I'll help you find something worth working for! 🎮🛹📱"`,
        version: '1.0'
      },

      product_recommendation: {
        name: 'product_recommendation',
        description: 'Recommend products based on user needs and segment with AI detection',
        template: `You're the GottaEarn.it assistant helping {{userAge ? 'a ' + userAge + ' year old' : 'this young person'}} find something awesome to earn! Remember: "You want something, you gotta earn it!"

They said: "{{userMessage}}"

{{#products.length}}
Awesome! I found {{products.length}} cool things you could work towards earning! 🎯

{{#products}}
**{{title}}** - {{price}}
{{description}}
{{#source}}{{#ifEquals source 'rainforest'}}✨ *Available on Amazon*{{/ifEquals}}{{/source}}
💪 This would be an awesome goal to earn!

{{/products}}
{{/products.length}}

{{^products.length}}
Hmm, I don't have exact matches right now, but let's find something else amazing you can work towards earning! What other cool stuff have you been thinking about?
{{/products.length}}

For your response:
1. **Be encouraging about earning** - emphasize how cool it'll be when they earn it
2. **Make it aspirational** - these are goals worth working for!
3. **Keep it age-appropriate and fun**
4. **Ask what they think** - "Which one would you be most excited to earn?" or "Want to see more options?"

Remember: At GottaEarn.it, every reward is earned through responsibility and hard work! 💪

{{userAge && userAge <= 15 ? 'Focus on fun factor, ease of use, and what makes it cool for their age group. Mention durability and parent-friendliness.' : ''}}
{{userAge && userAge >= 16 ? 'Focus on features, quality, brand reputation, and long-term value. Consider their lifestyle and goals.' : ''}}

{{#products.length}}End with a question about their budget, preferred features, or specific needs to help narrow down the perfect choice.{{/products.length}}

{{^products.length}}Ask about their specific requirements, budget range, or preferred features to help find better matches.{{/products.length}}

Keep response conversational and under 160 words.`,
        version: '2.0'
      },

      purchase_assistant: {
        name: 'purchase_assistant',
        description: 'Help users make purchase decisions',
        template: `The user is interested in making a purchase. Here's what they said:

"{{userMessage}}"

{{#products.length}}
They're considering:
{{#products}}
- {{title}} - {{price}}
{{/products}}
{{/products.length}}

As a helpful shopping assistant for {{userAge ? 'a ' + userAge + ' year old' : 'this customer'}}, provide:

1. **Key considerations** for their purchase decision
2. **Value assessment** - is this a good deal?
3. **Alternatives** if available in our inventory
4. **Next steps** - what they should do

{{userAge && userAge <= 18 ? 'Consider budget limitations and suggest asking parents/guardians if needed.' : ''}}
{{userAge && userAge >= 16 ? 'Focus on research, reviews, and making informed decisions.' : ''}}

Be supportive but not pushy. Help them make the best choice for their needs and budget.

Keep response under 120 words.`,
        version: '1.0'
      },

      product_comparison: {
        name: 'product_comparison',
        description: 'Compare multiple products side by side',
        template: `Help compare products for {{userAge ? 'a ' + userAge + ' year old' : 'this customer'}}. They asked:

"{{userMessage}}"

Available products for comparison:
{{#products}}
**{{title}}** - {{price}}
- {{description}}
{{/products}}

Provide a clear comparison with:

1. **Key differences** between the products
2. **Best for** scenarios (who should choose what)
3. **Value comparison** (price vs features)
4. **Recommendation** based on typical needs for their age group

{{userAge && userAge <= 15 ? 'Focus on fun factor, ease of use, and durability.' : ''}}
{{userAge && userAge >= 16 ? 'Focus on features, quality, brand reputation, and long-term value.' : ''}}

End with a question about their specific priorities to narrow down the choice.

Keep response under 140 words.`,
        version: '1.0'
      },

      general_chat: {
        name: 'general_chat',
        description: 'Handle general conversation and keep engagement high',
        template: `Continue the conversation with {{userAge ? 'a ' + userAge + ' year old' : 'this customer'}}. They said:

"{{userMessage}}"

{{#messageHistory.length}}
Recent conversation:
{{#messageHistory}}
{{role}}: {{content}}
{{/messageHistory}}
{{/messageHistory.length}}

Respond naturally and try to:
1. **Acknowledge** their message appropriately
2. **Guide** the conversation toward products or shopping interests
3. **Ask engaging questions** about their hobbies, needs, or preferences
4. **Maintain energy** and show genuine interest

{{userAge && userAge <= 15 ? 'Be enthusiastic! Ask about school, hobbies, favorite things, or what they\'re excited about.' : ''}}
{{userAge && userAge >= 16 ? 'Be more conversational and mature. Ask about goals, lifestyle, or current interests.' : ''}}

{{#products.length}}
If relevant, mention we have products related to their interests:
{{#products}}
- {{title}}
{{/products}}
{{/products.length}}

Keep response under 100 words and end with a question.`,
        version: '1.0'
      }
    };

    // Store in memory cache
    Object.entries(defaultTemplates).forEach(([key, template]) => {
      this.templates.set(key, template);
    });
  }

  /**
   * Get a prompt template and prepare it for use
   */
  async getTemplate(templateName, context = {}) {
    // First try memory cache
    let template = this.templates.get(templateName);
    
    if (!template) {
      // Try database
      const dbTemplate = await prisma.promptTemplate.findUnique({
        where: { name: templateName }
      });
      
      if (dbTemplate) {
        template = dbTemplate;
        this.templates.set(templateName, template);
      } else {
        // Fallback to general_chat
        console.warn(`⚠️ Template ${templateName} not found, using general_chat`);
        template = this.templates.get('general_chat');
      }
    }

    return {
      ...template,
      buildPrompt: (data) => this.buildPrompt(template.template, { ...context, ...data })
    };
  }

  /**
   * Build final prompt by replacing template variables
   */
  buildPrompt(template, data) {
    let prompt = template;

    // Handle simple variable replacement {{variable}}
    prompt = prompt.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : '';
    });

    // Handle conditional blocks {{#condition}}...{{/condition}}
    prompt = prompt.replace(/\{\{#(\w+(?:\.\w+)?)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, condition, content) => {
      const value = this.getNestedValue(data, condition);
      return (value && (Array.isArray(value) ? value.length > 0 : !!value)) ? content : '';
    });

    // Handle array iterations {{#array}}...{{/array}}
    prompt = prompt.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (match, arrayName, content) => {
      const array = data[arrayName];
      if (!Array.isArray(array)) return '';

      return array.map(item => {
        let itemContent = content;
        // Replace {{property}} within iteration
        itemContent = itemContent.replace(/\{\{(\w+)\}\}/g, (match, prop) => {
          return item[prop] !== undefined ? item[prop] : '';
        });
        return itemContent;
      }).join('');
    });

    // Handle ternary conditions {{userAge && userAge <= 15 ? 'young content' : 'older content'}}
    prompt = prompt.replace(/\{\{([^}]+\?[^}]+:[^}]+)\}\}/g, (match, expression) => {
      try {
        // Simple evaluation (expand this for more complex conditions)
        const func = new Function('data', `with(data) { return ${expression}; }`);
        return func(data) || '';
      } catch (e) {
        console.warn('⚠️ Template expression evaluation failed:', expression);
        return '';
      }
    });

    // Clean up extra whitespace
    prompt = prompt.replace(/\n\s*\n/g, '\n').trim();

    return prompt;
  }

  /**
   * Get nested object value using dot notation
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : null;
    }, obj);
  }

  /**
   * Track template usage for analytics
   */
  async trackUsage(templateName) {
    try {
      await prisma.promptTemplate.upsert({
        where: { name: templateName },
        update: { usageCount: { increment: 1 } },
        create: {
          name: templateName,
          description: `Auto-created template: ${templateName}`,
          template: this.templates.get(templateName)?.template || 'Template content not found',
          usageCount: 1
        }
      });
    } catch (error) {
      console.error('📊❌ Failed to track template usage:', error);
    }
  }

  /**
   * Create or update a custom template (for admin interface)
   */
  async saveTemplate(name, description, template, version = '1.0') {
    const savedTemplate = await prisma.promptTemplate.upsert({
      where: { name },
      update: { description, template, version },
      create: { name, description, template, version }
    });

    // Update memory cache
    this.templates.set(name, savedTemplate);

    return savedTemplate;
  }

  /**
   * Get all templates for admin interface
   */
  async getAllTemplates() {
    return await prisma.promptTemplate.findMany({
      orderBy: { usageCount: 'desc' }
    });
  }

  /**
   * Get template usage analytics
   */
  async getUsageAnalytics() {
    const templates = await prisma.promptTemplate.findMany({
      select: {
        name: true,
        usageCount: true,
        avgRating: true,
        createdAt: true
      },
      orderBy: { usageCount: 'desc' }
    });

    const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);

    return {
      templates,
      totalUsage,
      mostUsed: templates[0],
      averageRating: templates.reduce((sum, t) => sum + (t.avgRating || 0), 0) / templates.length
    };
  }

  /**
   * Test template rendering with sample data
   */
  testTemplate(templateName, sampleData) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    return this.buildPrompt(template.template, sampleData);
  }
}

export const promptTemplates = new PromptTemplates();
