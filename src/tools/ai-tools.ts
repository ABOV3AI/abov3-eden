/**
 * AI Tools - Local-first AI capabilities with optional API fallback
 * Provides text analysis, sentiment, entity extraction using local models
 *
 * Design Philosophy:
 * - Air-gapped first: All tools work offline using local models
 * - Optional API fallback: If configured, can use cloud APIs for enhanced capabilities
 * - Graceful degradation: Falls back to simpler methods if models unavailable
 */

import type { Tool } from './index.js';
import { imageResult, mixedResult } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Lazy load transformers
let pipeline: any = null;
let env: any = null;

async function getTransformers() {
  if (!pipeline) {
    try {
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;
      env = transformers.env;

      // Configure for local-only operation
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.useBrowserCache = false;
    } catch (e) {
      console.warn('Transformers.js not available, using fallback methods');
    }
  }
  return { pipeline, env };
}

// Simple sentiment analysis fallback
function simpleSentiment(text: string): { label: string; score: number } {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'happy', 'best', 'perfect', 'nice', 'awesome', 'brilliant', 'superb', 'outstanding'];
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'poor', 'disappointing', 'sad', 'angry', 'frustrated', 'annoyed', 'upset', 'wrong', 'fail'];

  const words = text.toLowerCase().split(/\W+/);
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of words) {
    if (positiveWords.includes(word)) positiveCount++;
    if (negativeWords.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount || 1;
  const score = (positiveCount - negativeCount) / total;

  if (score > 0.2) return { label: 'POSITIVE', score: Math.min(0.5 + score * 0.5, 1) };
  if (score < -0.2) return { label: 'NEGATIVE', score: Math.min(0.5 + Math.abs(score) * 0.5, 1) };
  return { label: 'NEUTRAL', score: 0.5 + Math.abs(score) * 0.3 };
}

// Simple keyword extraction fallback
function extractKeywords(text: string, count: number = 10): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also']);

  const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
  const frequency: Record<string, number> = {};

  for (const word of words) {
    if (!stopWords.has(word)) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  }

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([word]) => word);
}

// Simple entity extraction fallback
function extractEntities(text: string): { type: string; value: string; start: number; end: number }[] {
  const entities: { type: string; value: string; start: number; end: number }[] = [];

  // Email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  let match;
  while ((match = emailRegex.exec(text)) !== null) {
    entities.push({ type: 'EMAIL', value: match[0], start: match.index, end: match.index + match[0].length });
  }

  // URLs
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;
  while ((match = urlRegex.exec(text)) !== null) {
    entities.push({ type: 'URL', value: match[0], start: match.index, end: match.index + match[0].length });
  }

  // Phone numbers
  const phoneRegex = /\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g;
  while ((match = phoneRegex.exec(text)) !== null) {
    entities.push({ type: 'PHONE', value: match[0], start: match.index, end: match.index + match[0].length });
  }

  // Dates
  const dateRegex = /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/gi;
  while ((match = dateRegex.exec(text)) !== null) {
    entities.push({ type: 'DATE', value: match[0], start: match.index, end: match.index + match[0].length });
  }

  // Money amounts
  const moneyRegex = /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:dollars?|USD|EUR|GBP)\b/gi;
  while ((match = moneyRegex.exec(text)) !== null) {
    entities.push({ type: 'MONEY', value: match[0], start: match.index, end: match.index + match[0].length });
  }

  // Percentages
  const percentRegex = /\b\d+(?:\.\d+)?%\b/g;
  while ((match = percentRegex.exec(text)) !== null) {
    entities.push({ type: 'PERCENT', value: match[0], start: match.index, end: match.index + match[0].length });
  }

  // Capitalized words (potential names/places)
  const capitalizedRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
  while ((match = capitalizedRegex.exec(text)) !== null) {
    // Filter out sentence starts
    if (match.index > 0 && text[match.index - 2] !== '.') {
      entities.push({ type: 'NAME', value: match[0], start: match.index, end: match.index + match[0].length });
    }
  }

  return entities.sort((a, b) => a.start - b.start);
}

// Simple text summarization fallback
function simpleSummarize(text: string, sentences: number = 3): string {
  const sentenceRegex = /[^.!?]*[.!?]+/g;
  const allSentences = text.match(sentenceRegex) || [text];

  if (allSentences.length <= sentences) {
    return text.trim();
  }

  // Score sentences by keyword frequency
  const keywords = extractKeywords(text, 20);
  const scores = allSentences.map(sentence => {
    const words = sentence.toLowerCase().split(/\W+/);
    let score = 0;
    for (const word of words) {
      if (keywords.includes(word)) score++;
    }
    // Boost first sentence
    if (allSentences.indexOf(sentence) === 0) score += 2;
    return { sentence, score };
  });

  // Get top sentences in original order
  const topSentences = scores
    .sort((a, b) => b.score - a.score)
    .slice(0, sentences)
    .sort((a, b) => allSentences.indexOf(a.sentence) - allSentences.indexOf(b.sentence))
    .map(s => s.sentence.trim());

  return topSentences.join(' ');
}

export const aiTools: Tool[] = [
  {
    name: 'ai_sentiment',
    description: 'Analyze the sentiment of text (positive, negative, neutral). Works offline using local analysis',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to analyze',
        },
        file: {
          type: 'string',
          description: 'Path to text file (alternative to text)',
        },
      },
      required: [],
    },
    handler: async ({ text, file }) => {
      try {
        let content = text;

        if (file && !text) {
          const filePath = path.resolve(file);
          content = await fs.readFile(filePath, 'utf-8');
        }

        if (!content) {
          return { error: 'Either text or file is required' };
        }

        const { pipeline: pipelineFn } = await getTransformers();

        let result;
        if (pipelineFn) {
          try {
            const classifier = await pipelineFn('sentiment-analysis', 'Xenova/distilbert-base-uncased-finetuned-sst-2-english');
            const output = await classifier(content.slice(0, 512)); // Limit for model
            result = {
              label: output[0].label,
              score: output[0].score,
              model: 'distilbert-sst-2',
            };
          } catch {
            // Fall back to simple method
            result = {
              ...simpleSentiment(content),
              model: 'simple-lexicon',
            };
          }
        } else {
          result = {
            ...simpleSentiment(content),
            model: 'simple-lexicon',
          };
        }

        return {
          success: true,
          sentiment: result.label,
          confidence: result.score,
          model: result.model,
          textLength: content.length,
        };
      } catch (error) {
        return { error: `Failed to analyze sentiment: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_keywords',
    description: 'Extract keywords and key phrases from text. Works offline',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to extract keywords from',
        },
        file: {
          type: 'string',
          description: 'Path to text file (alternative to text)',
        },
        count: {
          type: 'number',
          description: 'Number of keywords to extract. Default: 10',
        },
      },
      required: [],
    },
    handler: async ({ text, file, count = 10 }) => {
      try {
        let content = text;

        if (file && !text) {
          const filePath = path.resolve(file);
          content = await fs.readFile(filePath, 'utf-8');
        }

        if (!content) {
          return { error: 'Either text or file is required' };
        }

        const keywords = extractKeywords(content, count);

        // Calculate keyword frequencies
        const words = content.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const keywordStats = keywords.map(keyword => ({
          keyword,
          frequency: words.filter(w => w === keyword).length,
          percentage: ((words.filter(w => w === keyword).length / words.length) * 100).toFixed(2) + '%',
        }));

        return {
          success: true,
          keywords: keywordStats,
          count: keywords.length,
          totalWords: words.length,
          model: 'frequency-analysis',
        };
      } catch (error) {
        return { error: `Failed to extract keywords: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_entities',
    description: 'Extract named entities (people, places, organizations, dates, etc.) from text. Works offline',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to extract entities from',
        },
        file: {
          type: 'string',
          description: 'Path to text file (alternative to text)',
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entity types to extract (EMAIL, URL, PHONE, DATE, MONEY, PERCENT, NAME). Default: all',
        },
      },
      required: [],
    },
    handler: async ({ text, file, types }) => {
      try {
        let content = text;

        if (file && !text) {
          const filePath = path.resolve(file);
          content = await fs.readFile(filePath, 'utf-8');
        }

        if (!content) {
          return { error: 'Either text or file is required' };
        }

        let entities = extractEntities(content);

        if (types && types.length > 0) {
          const typeSet = new Set(types.map(t => t.toUpperCase()));
          entities = entities.filter(e => typeSet.has(e.type));
        }

        // Group by type
        const byType: Record<string, string[]> = {};
        for (const entity of entities) {
          if (!byType[entity.type]) byType[entity.type] = [];
          if (!byType[entity.type].includes(entity.value)) {
            byType[entity.type].push(entity.value);
          }
        }

        return {
          success: true,
          entities,
          byType,
          totalEntities: entities.length,
          uniqueEntities: Object.values(byType).reduce((sum, arr) => sum + arr.length, 0),
          model: 'pattern-matching',
        };
      } catch (error) {
        return { error: `Failed to extract entities: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_summarize',
    description: 'Summarize text content. Works offline using extractive summarization',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to summarize',
        },
        file: {
          type: 'string',
          description: 'Path to text file (alternative to text)',
        },
        sentences: {
          type: 'number',
          description: 'Number of sentences in summary. Default: 3',
        },
        maxLength: {
          type: 'number',
          description: 'Maximum summary length in characters',
        },
      },
      required: [],
    },
    handler: async ({ text, file, sentences = 3, maxLength }) => {
      try {
        let content = text;

        if (file && !text) {
          const filePath = path.resolve(file);
          content = await fs.readFile(filePath, 'utf-8');
        }

        if (!content) {
          return { error: 'Either text or file is required' };
        }

        let summary = simpleSummarize(content, sentences);

        if (maxLength && summary.length > maxLength) {
          summary = summary.slice(0, maxLength - 3) + '...';
        }

        return {
          success: true,
          summary,
          originalLength: content.length,
          summaryLength: summary.length,
          compressionRatio: ((1 - summary.length / content.length) * 100).toFixed(1) + '%',
          model: 'extractive-frequency',
        };
      } catch (error) {
        return { error: `Failed to summarize: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_language_detect',
    description: 'Detect the language of text. Works offline',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to detect language of',
        },
      },
      required: ['text'],
    },
    handler: async ({ text }) => {
      try {
        // Common word patterns for language detection
        const languagePatterns: Record<string, { words: string[]; chars: RegExp }> = {
          english: {
            words: ['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'on', 'with'],
            chars: /^[a-zA-Z\s.,!?'"-]+$/,
          },
          spanish: {
            words: ['el', 'la', 'de', 'que', 'y', 'en', 'un', 'es', 'se', 'los'],
            chars: /[áéíóúñü]/i,
          },
          french: {
            words: ['le', 'la', 'de', 'et', 'est', 'en', 'un', 'une', 'que', 'les'],
            chars: /[àâçéèêëîïôùûüÿœæ]/i,
          },
          german: {
            words: ['der', 'die', 'und', 'ist', 'in', 'den', 'von', 'zu', 'mit', 'das'],
            chars: /[äöüß]/i,
          },
          portuguese: {
            words: ['o', 'a', 'de', 'que', 'e', 'em', 'um', 'uma', 'para', 'com'],
            chars: /[ãõçáéíóú]/i,
          },
          italian: {
            words: ['il', 'la', 'di', 'che', 'e', 'in', 'un', 'una', 'per', 'con'],
            chars: /[àèéìíîòóùú]/i,
          },
          dutch: {
            words: ['de', 'het', 'en', 'van', 'een', 'in', 'is', 'op', 'te', 'dat'],
            chars: /[ëïĳ]/i,
          },
          russian: {
            words: ['и', 'в', 'на', 'не', 'что', 'с', 'он', 'как', 'это', 'для'],
            chars: /[\u0400-\u04FF]/,
          },
          chinese: {
            words: ['的', '是', '在', '了', '有', '和', '人', '这', '中', '大'],
            chars: /[\u4E00-\u9FFF]/,
          },
          japanese: {
            words: ['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し'],
            chars: /[\u3040-\u309F\u30A0-\u30FF]/,
          },
          korean: {
            words: ['이', '그', '저', '것', '수', '등', '들', '및', '약', '그리고'],
            chars: /[\uAC00-\uD7AF]/,
          },
          arabic: {
            words: ['في', 'من', 'على', 'إلى', 'أن', 'هذا', 'و', 'ما', 'هو', 'التي'],
            chars: /[\u0600-\u06FF]/,
          },
        };

        const words = text.toLowerCase().split(/\s+/);
        const scores: Record<string, number> = {};

        // Score by character patterns
        for (const [lang, pattern] of Object.entries(languagePatterns)) {
          scores[lang] = 0;

          // Character pattern match
          if (pattern.chars.test(text)) {
            scores[lang] += 3;
          }

          // Word pattern match
          for (const word of words) {
            if (pattern.words.includes(word)) {
              scores[lang] += 1;
            }
          }
        }

        // Find highest scoring language
        const sorted = Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .filter(([_, score]) => score > 0);

        if (sorted.length === 0) {
          return {
            success: true,
            language: 'unknown',
            confidence: 0,
            alternatives: [],
            model: 'pattern-matching',
          };
        }

        const maxScore = sorted[0][1];
        const confidence = Math.min(maxScore / 10, 1);

        return {
          success: true,
          language: sorted[0][0],
          confidence,
          alternatives: sorted.slice(1, 4).map(([lang, score]) => ({
            language: lang,
            confidence: Math.min(score / 10, 1),
          })),
          model: 'pattern-matching',
        };
      } catch (error) {
        return { error: `Failed to detect language: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_readability',
    description: 'Calculate readability scores for text (Flesch-Kincaid, etc.)',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to analyze',
        },
        file: {
          type: 'string',
          description: 'Path to text file (alternative to text)',
        },
      },
      required: [],
    },
    handler: async ({ text, file }) => {
      try {
        let content = text;

        if (file && !text) {
          const filePath = path.resolve(file);
          content = await fs.readFile(filePath, 'utf-8');
        }

        if (!content) {
          return { error: 'Either text or file is required' };
        }

        // Count sentences
        const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

        // Count words
        const words = content.match(/\b\w+\b/g) || [];
        const wordCount = words.length;

        // Count syllables (simple approximation)
        const countSyllables = (word: string): number => {
          word = word.toLowerCase();
          if (word.length <= 3) return 1;
          word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
          word = word.replace(/^y/, '');
          const syllables = word.match(/[aeiouy]{1,2}/g);
          return syllables ? syllables.length : 1;
        };

        const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

        // Calculate metrics
        const avgWordsPerSentence = wordCount / Math.max(sentences, 1);
        const avgSyllablesPerWord = totalSyllables / Math.max(wordCount, 1);

        // Flesch Reading Ease
        const fleschReadingEase = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);

        // Flesch-Kincaid Grade Level
        const fleschKincaidGrade = (0.39 * avgWordsPerSentence) + (11.8 * avgSyllablesPerWord) - 15.59;

        // Automated Readability Index
        const characters = content.replace(/\s/g, '').length;
        const ari = (4.71 * (characters / Math.max(wordCount, 1))) + (0.5 * avgWordsPerSentence) - 21.43;

        // Interpret Flesch Reading Ease
        let interpretation: string;
        if (fleschReadingEase >= 90) interpretation = 'Very Easy - 5th grade';
        else if (fleschReadingEase >= 80) interpretation = 'Easy - 6th grade';
        else if (fleschReadingEase >= 70) interpretation = 'Fairly Easy - 7th grade';
        else if (fleschReadingEase >= 60) interpretation = 'Standard - 8th-9th grade';
        else if (fleschReadingEase >= 50) interpretation = 'Fairly Difficult - 10th-12th grade';
        else if (fleschReadingEase >= 30) interpretation = 'Difficult - College';
        else interpretation = 'Very Difficult - College Graduate';

        return {
          success: true,
          scores: {
            fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
            fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
            automatedReadabilityIndex: Math.round(ari * 10) / 10,
          },
          interpretation,
          stats: {
            words: wordCount,
            sentences,
            syllables: totalSyllables,
            avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
            avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
          },
        };
      } catch (error) {
        return { error: `Failed to analyze readability: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_similarity',
    description: 'Calculate text similarity between two texts using various metrics',
    inputSchema: {
      type: 'object',
      properties: {
        text1: {
          type: 'string',
          description: 'First text',
        },
        text2: {
          type: 'string',
          description: 'Second text',
        },
        method: {
          type: 'string',
          enum: ['jaccard', 'cosine', 'levenshtein'],
          description: 'Similarity method. Default: cosine',
        },
      },
      required: ['text1', 'text2'],
    },
    handler: async ({ text1, text2, method = 'cosine' }) => {
      try {
        const words1 = text1.toLowerCase().match(/\b\w+\b/g) || [];
        const words2 = text2.toLowerCase().match(/\b\w+\b/g) || [];

        let similarity: number;

        switch (method) {
          case 'jaccard': {
            const set1 = new Set(words1);
            const set2 = new Set(words2);
            const intersection = new Set([...set1].filter(x => set2.has(x)));
            const union = new Set([...set1, ...set2]);
            similarity = intersection.size / union.size;
            break;
          }

          case 'levenshtein': {
            // Normalized Levenshtein distance
            const maxLen = Math.max(text1.length, text2.length);
            if (maxLen === 0) {
              similarity = 1;
            } else {
              const distance = levenshteinDistance(text1.toLowerCase(), text2.toLowerCase());
              similarity = 1 - (distance / maxLen);
            }
            break;
          }

          case 'cosine':
          default: {
            // Term frequency vectors
            const allWords = [...new Set([...words1, ...words2])];
            const tf1 = allWords.map(w => words1.filter(x => x === w).length);
            const tf2 = allWords.map(w => words2.filter(x => x === w).length);

            // Cosine similarity
            const dotProduct = tf1.reduce((sum, v, i) => sum + v * tf2[i], 0);
            const mag1 = Math.sqrt(tf1.reduce((sum, v) => sum + v * v, 0));
            const mag2 = Math.sqrt(tf2.reduce((sum, v) => sum + v * v, 0));
            similarity = mag1 && mag2 ? dotProduct / (mag1 * mag2) : 0;
            break;
          }
        }

        return {
          success: true,
          similarity: Math.round(similarity * 1000) / 1000,
          percentage: Math.round(similarity * 100) + '%',
          method,
          text1Length: text1.length,
          text2Length: text2.length,
        };
      } catch (error) {
        return { error: `Failed to calculate similarity: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'ai_text_classify',
    description: 'Classify text into custom categories based on keyword matching',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to classify',
        },
        categories: {
          type: 'object',
          additionalProperties: {
            type: 'array',
            items: { type: 'string' },
          },
          description: 'Categories with their keywords (e.g., {"tech": ["software", "computer"], "sports": ["football", "basketball"]})',
        },
        multiLabel: {
          type: 'boolean',
          description: 'Allow multiple categories. Default: true',
        },
      },
      required: ['text', 'categories'],
    },
    handler: async ({ text, categories, multiLabel = true }) => {
      try {
        const words = text.toLowerCase().split(/\W+/);
        const scores: Record<string, { score: number; matches: string[] }> = {};

        for (const [category, keywords] of Object.entries(categories)) {
          const matches: string[] = [];
          let score = 0;

          for (const keyword of keywords as string[]) {
            const keywordLower = keyword.toLowerCase();
            const count = words.filter(w => w === keywordLower || w.includes(keywordLower)).length;
            if (count > 0) {
              matches.push(keyword);
              score += count;
            }
          }

          if (score > 0) {
            scores[category] = { score, matches };
          }
        }

        const sorted = Object.entries(scores)
          .sort((a, b) => b[1].score - a[1].score);

        if (sorted.length === 0) {
          return {
            success: true,
            category: 'uncategorized',
            confidence: 0,
            allCategories: [],
          };
        }

        const totalScore = sorted.reduce((sum, [_, data]) => sum + data.score, 0);

        const results = sorted.map(([category, data]) => ({
          category,
          confidence: Math.round((data.score / totalScore) * 100) / 100,
          matches: data.matches,
        }));

        return {
          success: true,
          category: results[0].category,
          confidence: results[0].confidence,
          matches: results[0].matches,
          allCategories: multiLabel ? results : [results[0]],
        };
      } catch (error) {
        return { error: `Failed to classify text: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  // === AI IMAGE GENERATION (Stable Horde - Free, Community-Powered) ===
  {
    name: 'ai_image_generate',
    description: 'Generate an image from a text prompt using Stable Horde (free, community-powered). Uses Stable Diffusion models.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the image to generate',
        },
        negative_prompt: {
          type: 'string',
          description: 'What to avoid in the image. Default: "blurry, bad quality, distorted"',
        },
        width: {
          type: 'number',
          description: 'Image width in pixels (must be multiple of 64). Default: 512',
        },
        height: {
          type: 'number',
          description: 'Image height in pixels (must be multiple of 64). Default: 512',
        },
        steps: {
          type: 'number',
          description: 'Number of inference steps (10-50). Default: 25',
        },
        save_to: {
          type: 'string',
          description: 'Optional file path to save the image',
        },
      },
      required: ['prompt'],
    },
    handler: async ({ prompt, negative_prompt = 'blurry, bad quality, distorted, deformed', width = 512, height = 512, steps = 25, save_to }) => {
      try {
        console.log(`[Eden] Generating image via Stable Horde: "${prompt}"`);

        // Round dimensions to nearest 64
        const w = Math.round(width / 64) * 64;
        const h = Math.round(height / 64) * 64;

        // Submit generation request to Stable Horde
        const submitResponse = await fetch('https://stablehorde.net/api/v2/generate/async', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': '0000000000', // Anonymous API key (slower but free)
          },
          body: JSON.stringify({
            prompt: prompt + (negative_prompt ? ` ### ${negative_prompt}` : ''),
            params: {
              width: w,
              height: h,
              steps: Math.min(Math.max(steps, 10), 50),
              sampler_name: 'k_euler_a',
              cfg_scale: 7,
              karras: true,
              n: 1,
            },
            nsfw: false,
            censor_nsfw: true,
            trusted_workers: false,
            models: ['stable_diffusion'],
            r2: true,
          }),
        });

        if (!submitResponse.ok) {
          const errorText = await submitResponse.text();
          return { error: `Failed to submit image request: ${submitResponse.status} - ${errorText}` };
        }

        const submitData = await submitResponse.json();
        const jobId = submitData.id;
        console.log(`[Eden] Stable Horde job submitted: ${jobId}`);

        // Poll for completion (max 3 minutes)
        const maxWaitTime = 180000;
        const startTime = Date.now();
        let imageUrl: string | null = null;

        while (Date.now() - startTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s between polls

          const checkResponse = await fetch(`https://stablehorde.net/api/v2/generate/check/${jobId}`);
          if (!checkResponse.ok) continue;

          const checkData = await checkResponse.json();
          console.log(`[Eden] Job status: done=${checkData.done}, wait_time=${checkData.wait_time}s, queue=${checkData.queue_position}`);

          if (checkData.done) {
            // Get the final result
            const statusResponse = await fetch(`https://stablehorde.net/api/v2/generate/status/${jobId}`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              if (statusData.generations && statusData.generations.length > 0) {
                imageUrl = statusData.generations[0].img;
                break;
              }
            }
          }

          if (checkData.faulted) {
            return { error: 'Image generation failed on server. Please try again.' };
          }
        }

        if (!imageUrl) {
          return { error: 'Image generation timed out after 3 minutes. The service may be busy. Try again later.' };
        }

        // Fetch the actual image
        console.log(`[Eden] Fetching generated image...`);
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          return { error: `Failed to fetch generated image: ${imageResponse.status}` };
        }

        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        console.log(`[Eden] Image fetched: ${imageBuffer.length} bytes`);

        // Return the image as base64
        const base64Image = imageBuffer.toString('base64');

        // Try to save to file if requested (non-fatal if it fails)
        let saveMessage = '';
        if (save_to) {
          try {
            const savePath = path.resolve(save_to);
            // Ensure directory exists
            const saveDir = path.dirname(savePath);
            await fs.mkdir(saveDir, { recursive: true });
            await fs.writeFile(savePath, imageBuffer);
            saveMessage = `\n*Saved to: ${savePath}*`;
            console.log(`[Eden] Image saved to: ${savePath}`);
          } catch (saveError: any) {
            console.log(`[Eden] Warning: Could not save image: ${saveError.message}`);
            saveMessage = `\n*Note: Could not save to file (${saveError.message})*`;
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: `**Generated Image** (Stable Diffusion, ${w}x${h})\n*Prompt: "${prompt}"*${saveMessage}`,
            },
            {
              type: 'image',
              data: base64Image,
              mimeType: 'image/webp',
            },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { error: `Failed to generate image: ${message}` };
      }
    },
  },

  // === VIDEO/MEDIA ANALYSIS FOR LLM ===
  {
    name: 'video_analyze_frames',
    description: 'Extract frames from a video and return them as images for LLM vision analysis. The frames are returned directly for the AI to analyze.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the video file',
        },
        interval: {
          type: 'number',
          description: 'Extract one frame every N seconds. Default: 5',
        },
        max_frames: {
          type: 'number',
          description: 'Maximum number of frames to extract. Default: 10',
        },
        start_time: {
          type: 'string',
          description: 'Start time (HH:MM:SS or seconds). Default: 0',
        },
        end_time: {
          type: 'string',
          description: 'End time (HH:MM:SS or seconds). Default: end of video',
        },
        resize_width: {
          type: 'number',
          description: 'Resize frames to this width (preserves aspect ratio). Default: 512',
        },
      },
      required: ['input'],
    },
    handler: async ({ input, interval = 5, max_frames = 10, start_time, end_time, resize_width = 512 }) => {
      try {
        const inputPath = path.resolve(input);

        // Check if file exists
        await fs.access(inputPath);

        // Create temp directory for frames
        const tempDir = path.join(os.tmpdir(), `eden_frames_${Date.now()}`);
        await fs.mkdir(tempDir, { recursive: true });

        // Build ffmpeg command
        const ffmpeg = (await import('fluent-ffmpeg')).default;

        // Get video info first
        const videoInfo: any = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
            if (err) reject(err);
            else resolve(metadata);
          });
        });

        const duration = videoInfo.format.duration || 60;
        const frameCount = Math.min(max_frames, Math.ceil(duration / interval));

        // Build filter string
        let filter = `fps=1/${interval}`;
        if (resize_width) {
          filter += `,scale=${resize_width}:-1`;
        }

        // Extract frames
        await new Promise<void>((resolve, reject) => {
          let cmd = ffmpeg(inputPath)
            .outputOptions(['-vf', filter])
            .output(path.join(tempDir, 'frame_%04d.jpg'))
            .outputOptions(['-frames:v', String(frameCount)]);

          if (start_time) cmd = cmd.inputOptions(['-ss', String(start_time)]);
          if (end_time) cmd = cmd.outputOptions(['-t', String(end_time)]);

          cmd.on('end', () => resolve())
            .on('error', (err: any) => reject(err))
            .run();
        });

        // Read extracted frames
        const frameFiles = await fs.readdir(tempDir);
        const sortedFrames = frameFiles
          .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
          .sort();

        if (sortedFrames.length === 0) {
          await fs.rm(tempDir, { recursive: true, force: true });
          return { error: 'No frames were extracted from the video' };
        }

        // Build mixed result with frames
        const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

        content.push({
          type: 'text',
          text: `Extracted ${sortedFrames.length} frames from video "${path.basename(input)}" (duration: ${Math.round(duration)}s, interval: ${interval}s):\n`,
        });

        for (let i = 0; i < sortedFrames.length; i++) {
          const framePath = path.join(tempDir, sortedFrames[i]);
          const frameData = await fs.readFile(framePath);
          const base64 = frameData.toString('base64');

          const timestamp = i * interval;
          content.push({
            type: 'text',
            text: `\n--- Frame ${i + 1} (${formatTime(timestamp)}) ---`,
          });
          content.push({
            type: 'image',
            data: base64,
            mimeType: 'image/jpeg',
          });
        }

        // Cleanup temp directory
        await fs.rm(tempDir, { recursive: true, force: true });

        return mixedResult(content);
      } catch (error) {
        return { error: `Failed to extract frames: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'media_analyze',
    description: 'Comprehensive media analysis - extracts frames, audio transcription, and metadata for LLM analysis. Ideal for sports analysis, investigation, timeline reconstruction.',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to video or image file',
        },
        analysis_type: {
          type: 'string',
          enum: ['general', 'sports', 'investigation', 'timeline'],
          description: 'Type of analysis to optimize for. Default: general',
        },
        frame_interval: {
          type: 'number',
          description: 'Seconds between extracted frames. Default: 3',
        },
        max_frames: {
          type: 'number',
          description: 'Maximum frames to extract. Default: 15',
        },
        include_metadata: {
          type: 'boolean',
          description: 'Include detailed file metadata. Default: true',
        },
      },
      required: ['input'],
    },
    handler: async ({ input, analysis_type = 'general', frame_interval = 3, max_frames = 15, include_metadata = true }) => {
      try {
        const inputPath = path.resolve(input);
        await fs.access(inputPath);

        const ext = path.extname(inputPath).toLowerCase();
        const isVideo = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.flv', '.wmv'].includes(ext);
        const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'].includes(ext);

        if (!isVideo && !isImage) {
          return { error: `Unsupported file type: ${ext}. Supported: video (mp4, mkv, avi, mov, webm) or image (jpg, png, gif, webp)` };
        }

        const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];

        // Add analysis header
        const analysisHints: Record<string, string> = {
          general: 'Describe what you see in the media. Identify key objects, people, actions, and any notable details.',
          sports: 'Analyze this as sports footage. Identify players, teams, game state, key plays, momentum shifts, and predict likely outcomes.',
          investigation: 'Analyze this as evidence. Look for details that could be relevant to an investigation: people, objects, timestamps, locations, inconsistencies.',
          timeline: 'Create a timeline of events shown in this media. Note timestamps, sequence of actions, and any changes over time.',
        };

        content.push({
          type: 'text',
          text: `## Media Analysis (${analysis_type})\n\n${analysisHints[analysis_type]}\n`,
        });

        if (isImage) {
          // Single image analysis
          const imageData = await fs.readFile(inputPath);
          const base64 = imageData.toString('base64');
          const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';

          content.push({
            type: 'text',
            text: `\n**Image:** ${path.basename(inputPath)}\n`,
          });
          content.push({
            type: 'image',
            data: base64,
            mimeType,
          });

          // Add image metadata if requested
          if (include_metadata) {
            const stats = await fs.stat(inputPath);
            content.push({
              type: 'text',
              text: `\n**Metadata:**\n- File size: ${(stats.size / 1024).toFixed(1)} KB\n- Modified: ${stats.mtime.toISOString()}\n`,
            });
          }
        } else {
          // Video analysis - extract frames
          const ffmpeg = (await import('fluent-ffmpeg')).default;

          // Get video info
          const videoInfo: any = await new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err: any, metadata: any) => {
              if (err) reject(err);
              else resolve(metadata);
            });
          });

          const duration = videoInfo.format.duration || 60;
          const videoStream = videoInfo.streams.find((s: any) => s.codec_type === 'video');
          const audioStream = videoInfo.streams.find((s: any) => s.codec_type === 'audio');

          content.push({
            type: 'text',
            text: `\n**Video:** ${path.basename(inputPath)}\n- Duration: ${formatTime(duration)}\n- Resolution: ${videoStream?.width}x${videoStream?.height}\n- FPS: ${eval(videoStream?.r_frame_rate || '30')?.toFixed(2)}\n${audioStream ? '- Has audio track\n' : '- No audio\n'}`,
          });

          // Create temp directory and extract frames
          const tempDir = path.join(os.tmpdir(), `eden_analyze_${Date.now()}`);
          await fs.mkdir(tempDir, { recursive: true });

          const frameCount = Math.min(max_frames, Math.ceil(duration / frame_interval));

          await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
              .outputOptions(['-vf', `fps=1/${frame_interval},scale=640:-1`])
              .output(path.join(tempDir, 'frame_%04d.jpg'))
              .outputOptions(['-frames:v', String(frameCount)])
              .on('end', () => resolve())
              .on('error', (err: any) => reject(err))
              .run();
          });

          // Read and add frames
          const frameFiles = await fs.readdir(tempDir);
          const sortedFrames = frameFiles.filter(f => f.startsWith('frame_')).sort();

          content.push({
            type: 'text',
            text: `\n**Frames (${sortedFrames.length} extracted at ${frame_interval}s intervals):**\n`,
          });

          for (let i = 0; i < sortedFrames.length; i++) {
            const framePath = path.join(tempDir, sortedFrames[i]);
            const frameData = await fs.readFile(framePath);
            const base64 = frameData.toString('base64');
            const timestamp = i * frame_interval;

            content.push({
              type: 'text',
              text: `\n[${formatTime(timestamp)}]`,
            });
            content.push({
              type: 'image',
              data: base64,
              mimeType: 'image/jpeg',
            });
          }

          // Cleanup
          await fs.rm(tempDir, { recursive: true, force: true });
        }

        content.push({
          type: 'text',
          text: '\n---\n\nPlease analyze the above media based on the specified analysis type.',
        });

        return mixedResult(content);
      } catch (error) {
        return { error: `Failed to analyze media: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];

/**
 * Format seconds as HH:MM:SS or MM:SS
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}
