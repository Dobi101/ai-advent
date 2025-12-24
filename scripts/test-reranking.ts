/**
 * Скрипт для тестирования фильтрации и reranking в RAG-агенте
 *
 * Запуск: npm run test:reranking
 * или: ts-node scripts/test-reranking.ts
 */

import * as fs from 'fs/promises';

// Интерфейсы для типизации ответов API
interface MethodComparisonResult {
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

// Тестовые вопросы: 3 по Docker, 1 вне темы
const testQuestions = [
  { question: 'Как установить Docker на Ubuntu?', category: 'Docker' },
  { question: 'Как работает Docker Compose и для чего он нужен?', category: 'Docker' },
  { question: 'Как пробросить порты в Docker контейнере?', category: 'Docker' },
  { question: 'Какая погода в Москве?', category: 'Вне темы' },
];

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Проверка доступности сервера
 */
async function checkServerHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_BASE_URL}/api/indexing/stats`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.status !== 0;
  } catch (error) {
    return false;
  }
}

/**
 * Вызов API сравнения методов
 */
async function fetchCompareMethods(
  question: string,
): Promise<MethodComparisonResult> {
  const response = await fetch(`${API_BASE_URL}/rag/compare-methods`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return await response.json();
}

/**
 * Вывод результата сравнения для одного вопроса
 */
function printQuestionResult(
  category: string,
  result: MethodComparisonResult,
): void {
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║  ВОПРОС: ' + result.question.padEnd(67) + '║');
  console.log('║  Категория: ' + category.padEnd(64) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');

  // Базовый RAG
  console.log('\n┌─ БАЗОВЫЙ RAG ─────────────────────────────────────────────────────────────┐');
  console.log(`│ Документов: ${result.methods.basic.sources.length}`);
  console.log(`│ Время: ${result.methods.basic.time}ms`);
  console.log('│');
  console.log('│ Ответ:');
  console.log(result.methods.basic.answer);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  // С фильтрацией
  const filteredScores =
    result.methods.filtered.scores.length > 0
      ? result.methods.filtered.scores.map((s) => s.toFixed(2)).join(', ')
      : 'нет';

  console.log('\n┌─ С ФИЛЬТРАЦИЕЙ (threshold=0.7) ───────────────────────────────────────────┐');
  console.log(`│ Документов: ${result.methods.filtered.usedDocuments}`);
  console.log(`│ Scores: [${filteredScores}]`);
  console.log(`│ Время: ${result.methods.filtered.time}ms`);
  console.log('│');
  console.log('│ Ответ:');
  console.log(result.methods.filtered.answer);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  // С reranking
  const pipeline = result.methods.reranked.pipeline;
  const rerankSources = result.methods.reranked.sources;

  const vectorScores =
    rerankSources.length > 0
      ? rerankSources.map((s) => s.vectorScore.toFixed(2)).join(', ')
      : 'нет';

  const rerankScores =
    rerankSources.length > 0
      ? rerankSources.map((s) => s.rerankScore.toFixed(2)).join(', ')
      : 'нет';

  console.log('\n┌─ С RERANKING ─────────────────────────────────────────────────────────────┐');
  console.log(`│ Pipeline: ${pipeline.totalCandidates} → ${pipeline.afterFilter} → ${pipeline.afterRerank}`);
  console.log(`│ Vector scores: [${vectorScores}]`);
  console.log(`│ Rerank scores: [${rerankScores}]`);
  console.log(`│ Время: ${result.methods.reranked.time}ms`);
  console.log('│');
  console.log('│ Ответ:');
  console.log(result.methods.reranked.answer);
  console.log('└────────────────────────────────────────────────────────────────────────────┘');

  // Анализ
  console.log('\n📊 АНАЛИЗ:');
  console.log(
    `   Документов использовано: базовый=${result.analysis.documentsUsed.basic}, ` +
      `фильтр=${result.analysis.documentsUsed.filtered}, ` +
      `rerank=${result.analysis.documentsUsed.reranked}`,
  );
  console.log(`   ${result.analysis.qualityComparison}`);
}

/**
 * Генерация markdown отчета
 */
function generateMarkdownReport(
  results: Array<{
    category: string;
    result: MethodComparisonResult;
  }>,
): string {
  let md = '# Отчет по тестированию Reranking в RAG\n\n';
  md += `Дата: ${new Date().toISOString()}\n\n`;

  // Сводная таблица
  md += '## Сводка\n\n';
  md += '| Вопрос | Базовый | Фильтр | Rerank | Рекомендация |\n';
  md += '|--------|---------|--------|--------|---------------|\n';

  for (const { result } of results) {
    const basic = result.analysis.documentsUsed.basic;
    const filtered = result.analysis.documentsUsed.filtered;
    const reranked = result.analysis.documentsUsed.reranked;
    const recommendation =
      reranked > 0
        ? 'Reranking'
        : filtered > 0
          ? 'Фильтрация'
          : 'Базовый';

    md += `| ${result.question.substring(0, 40)}... | ${basic} док | ${filtered} док | ${reranked} док | ${recommendation} |\n`;
  }

  // Детальные результаты
  md += '\n## Детальные результаты\n\n';

  for (const { category, result } of results) {
    md += `### ${result.question}\n\n`;
    md += `**Категория:** ${category}\n\n`;

    md += '#### Базовый RAG\n';
    md += `- Документов: ${result.methods.basic.sources.length}\n`;
    md += `- Время: ${result.methods.basic.time}ms\n`;
    md += `- Ответ:\n\n${result.methods.basic.answer}\n\n`;

    md += '#### С фильтрацией (threshold=0.7)\n';
    md += `- Документов: ${result.methods.filtered.usedDocuments}\n`;
    md += `- Scores: [${result.methods.filtered.scores.map((s) => s.toFixed(2)).join(', ')}]\n`;
    md += `- Время: ${result.methods.filtered.time}ms\n`;
    md += `- Ответ:\n\n${result.methods.filtered.answer}\n\n`;

    md += '#### С Reranking\n';
    const p = result.methods.reranked.pipeline;
    md += `- Pipeline: ${p.totalCandidates} → ${p.afterFilter} → ${p.afterRerank}\n`;
    if (result.methods.reranked.sources.length > 0) {
      md += `- Vector scores: [${result.methods.reranked.sources.map((s) => s.vectorScore.toFixed(2)).join(', ')}]\n`;
      md += `- Rerank scores: [${result.methods.reranked.sources.map((s) => s.rerankScore.toFixed(2)).join(', ')}]\n`;
    }
    md += `- Время: ${result.methods.reranked.time}ms\n`;
    md += `- Ответ:\n\n${result.methods.reranked.answer}\n\n`;

    md += `**Анализ:** ${result.analysis.qualityComparison}\n\n`;
    md += '---\n\n';
  }

  return md;
}

/**
 * Главная функция
 */
async function main() {
  console.log('\n🚀 Запуск тестирования Reranking в RAG-агенте\n');
  console.log(`📍 API URL: ${API_BASE_URL}\n`);

  // Проверка доступности сервера
  console.log('🔍 Проверка доступности сервера...');
  const isServerAvailable = await checkServerHealth();

  if (!isServerAvailable) {
    console.error('\n❌ ОШИБКА: Сервер недоступен!\n');
    console.error('   Убедитесь, что сервер NestJS запущен:');
    console.error('   npm run start:dev\n');
    process.exit(1);
  }

  console.log('✅ Сервер доступен\n');

  const allResults: Array<{
    category: string;
    result: MethodComparisonResult;
  }> = [];

  // Проход по вопросам
  for (let i = 0; i < testQuestions.length; i++) {
    const { question, category } = testQuestions[i];

    try {
      console.log(
        `\n⏳ Обработка вопроса ${i + 1}/${testQuestions.length}: "${question}"...`,
      );

      const result = await fetchCompareMethods(question);
      printQuestionResult(category, result);

      allResults.push({
        category,
        result,
      });

      // Задержка между запросами
      if (i < testQuestions.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error(`\n❌ Ошибка при обработке вопроса: ${question}`);
      console.error(
        `   ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  // Сохранение результатов
  const jsonFile = 'reranking-results.json';
  const mdFile = 'reranking-summary.md';

  await fs.writeFile(jsonFile, JSON.stringify(allResults, null, 2), 'utf-8');

  const markdownReport = generateMarkdownReport(allResults);
  await fs.writeFile(mdFile, markdownReport, 'utf-8');

  // Итоги
  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ Тестирование завершено!');
  console.log(`📄 JSON результаты: ${jsonFile}`);
  console.log(`📝 Markdown отчет: ${mdFile}`);
  console.log(`📊 Всего обработано вопросов: ${allResults.length}\n`);

  // Краткая статистика
  const stats = {
    withReranking: allResults.filter(
      (r) => r.result.methods.reranked.sources.length > 0,
    ).length,
    withFiltering: allResults.filter(
      (r) => r.result.methods.filtered.usedDocuments > 0,
    ).length,
    noResults: allResults.filter(
      (r) =>
        r.result.methods.filtered.usedDocuments === 0 &&
        r.result.methods.reranked.sources.length === 0,
    ).length,
  };

  console.log('📈 Статистика:');
  console.log(`   - С результатами reranking: ${stats.withReranking}`);
  console.log(`   - С результатами фильтрации: ${stats.withFiltering}`);
  console.log(`   - Без релевантных результатов: ${stats.noResults}\n`);
}

// Запуск скрипта
main().catch((error) => {
  console.error('\n❌ Критическая ошибка:', error);
  process.exit(1);
});
