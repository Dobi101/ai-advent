import { Chunk } from '../document-indexing/entities/chunk.entity';

/**
 * Базовый результат поиска
 */
export interface SearchResult {
  chunk: Chunk;
  score: number;
  rank: number;
  document: {
    id: string;
    title: string;
    filepath: string;
  };
}

/**
 * Результат поиска с rerank score
 */
export interface RankedResult extends SearchResult {
  rerankScore: number;
}

/**
 * Результат фильтрации поиска
 */
export interface FilteredSearchResult {
  results: SearchResult[];
  total: number;
  filtered: number;
  threshold: number;
}

/**
 * Ответ RAG с фильтрацией
 */
export interface FilteredRAGResponse {
  answer: string;
  sources: string[];
  scores: number[];
  usedDocuments: number;
  totalCandidates: number;
  threshold: number;
}

/**
 * Ответ RAG с переранжированием
 */
export interface RerankingRAGResponse {
  answer: string;
  sources: Array<{
    source: string;
    vectorScore: number;
    rerankScore: number;
  }>;
  pipeline: {
    totalCandidates: number;
    afterFilter: number;
    afterRerank: number;
  };
}

/**
 * Результат сравнения порогов
 */
export interface ThresholdComparisonResult {
  question: string;
  results: Array<{
    threshold: number;
    answer: string;
    sources: string[];
    scores: number[];
    usedDocuments: number;
    totalCandidates: number;
  }>;
  recommendation: {
    bestThreshold: number;
    reason: string;
  };
}

/**
 * Результат сравнения методов RAG
 */
export interface MethodComparisonResult {
  question: string;
  methods: {
    basic: {
      answer: string;
      sources: string[];
      time: number;
    };
    filtered: {
      answer: string;
      sources: string[];
      scores: number[];
      usedDocuments: number;
      time: number;
    };
    reranked: {
      answer: string;
      sources: Array<{
        source: string;
        vectorScore: number;
        rerankScore: number;
      }>;
      pipeline: {
        totalCandidates: number;
        afterFilter: number;
        afterRerank: number;
      };
      time: number;
    };
  };
  analysis: {
    documentsUsed: {
      basic: number;
      filtered: number;
      reranked: number;
    };
    qualityComparison: string;
  };
}
