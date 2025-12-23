/**
 * Скрипт для автоматического тестирования RAG-агента
 * 
 * Запуск: npm run test:rag
 * или: ts-node scripts/test-rag.ts
 */

interface CompareResult {
  question: string;
  withRAG: {
    answer: string;
    sources?: string[];
    usedContext: boolean;
  };
  withoutRAG: {
    answer: string;
    usedContext: boolean;
  };
  timestamp: string;
}

// Категории вопросов для тестирования
const questions = {
  // Категория: По документации Docker (RAG должен помочь)
  documentation: [
    'Что такое Docker и для чего он используется?',
    'Как создать Docker образ?',
    'В чем разница между Docker образом и контейнером?',
  ],
};

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Проверка доступности сервера
 */
async function checkServerHealth(): Promise<boolean> {
  try {
    // Пробуем несколько эндпоинтов для проверки
    const endpoints = [
      `${API_BASE_URL}/api/indexing/stats`,
      `${API_BASE_URL}/rag/query`, // Проверка RAG эндпоинта
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(endpoint, {
          method: endpoint.includes('/stats') ? 'GET' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: endpoint.includes('/stats') ? undefined : JSON.stringify({ question: 'test', useRAG: false }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Если получили ответ (даже ошибку валидации), сервер работает
        if (response.status !== 0) {
          return true;
        }
      } catch (e) {
        // Продолжаем проверку следующего эндпоинта
        continue;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Форматирование текста для консоли
 */
function formatBox(title: string, content: string, width: number = 80): string {
  const lines = content.split('\n');
  const border = '═'.repeat(width);
  const titleLine = `║ ${title.padEnd(width - 4)} ║`;
  const emptyLine = `║ ${' '.repeat(width - 4)} ║`;

  let result = `╔${border}╗\n`;
  result += titleLine + '\n';
  result += `╠${border}╣\n`;

  for (const line of lines) {
    const wrapped = wrapText(line, width - 4);
    for (const wrappedLine of wrapped) {
      result += `║ ${wrappedLine.padEnd(width - 4)} ║\n`;
    }
  }

  result += `╚${border}╝\n`;
  return result;
}

/**
 * Перенос текста по словам
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + word).length <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [''];
}

/**
 * Выполнение HTTP запроса
 */
async function fetchCompare(question: string): Promise<CompareResult> {
  const response = await fetch(`${API_BASE_URL}/rag/compare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `HTTP ${response.status}: ${errorText}`,
    );
  }

  return await response.json();
}

/**
 * Вывод результата сравнения
 */
function printComparison(
  category: string,
  question: string,
  result: CompareResult,
  index: number,
): void {
  console.log('\n' + '='.repeat(80));
  console.log(
    `\n📋 КАТЕГОРИЯ: ${category.toUpperCase()} | ВОПРОС ${index + 1}`,
  );
  console.log('='.repeat(80));
  console.log(`\n❓ ВОПРОС: ${question}\n`);

  // Ответ с RAG
  console.log(formatBox('✅ С RAG', result.withRAG.answer));
  if (result.withRAG.sources && result.withRAG.sources.length > 0) {
    console.log(
      `📚 Источники: ${result.withRAG.sources.join(', ')}\n`,
    );
  }

  // Ответ без RAG
  console.log(formatBox('❌ БЕЗ RAG', result.withoutRAG.answer));

  console.log(`\n⏰ Время: ${result.timestamp}\n`);
}

/**
 * Главная функция
 */
async function main() {
  console.log('\n🚀 Запуск тестирования RAG-агента\n');
  console.log(`📍 API URL: ${API_BASE_URL}\n`);

  // Проверка доступности сервера
  console.log('🔍 Проверка доступности сервера...');
  const isServerAvailable = await checkServerHealth();

  if (!isServerAvailable) {
    console.error('\n❌ ОШИБКА: Сервер недоступен!\n');
    console.error('   Убедитесь, что сервер NestJS запущен:');
    console.error('   npm run start:dev\n');
    console.error('   Или проверьте, что сервер работает на правильном порту.');
    console.error(`   Ожидаемый URL: ${API_BASE_URL}\n`);
    process.exit(1);
  }

  console.log('✅ Сервер доступен\n');

  const allResults: Array<{
    category: string;
    question: string;
    result: CompareResult;
  }> = [];

  // Проход по всем категориям
  for (const [categoryName, categoryQuestions] of Object.entries(questions)) {
    const categoryLabel = '📖 По документации Docker';

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`\n${categoryLabel}`);
    console.log(`${'─'.repeat(80)}\n`);

    // Проход по вопросам в категории
    for (let i = 0; i < categoryQuestions.length; i++) {
      const question = categoryQuestions[i];

      try {
        console.log(`\n⏳ Обработка вопроса ${i + 1}/${categoryQuestions.length}...`);
        const result = await fetchCompare(question);
        printComparison(categoryLabel, question, result, i);
        allResults.push({
          category: categoryLabel,
          question,
          result,
        });

        // Небольшая задержка между запросами
        if (i < categoryQuestions.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`\n❌ Ошибка при обработке вопроса: ${question}`);
        console.error(`   ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }

  // Сохранение результатов в JSON
  const outputFile = 'comparison-results.json';
  const fs = await import('fs/promises');
  await fs.writeFile(
    outputFile,
    JSON.stringify(allResults, null, 2),
    'utf-8',
  );

  console.log('\n' + '='.repeat(80));
  console.log('\n✅ Тестирование завершено!');
  console.log(`📄 Результаты сохранены в: ${outputFile}\n`);
  console.log(`📊 Всего обработано вопросов: ${allResults.length}\n`);
}

// Запуск скрипта
main().catch((error) => {
  console.error('\n❌ Критическая ошибка:', error);
  process.exit(1);
});

