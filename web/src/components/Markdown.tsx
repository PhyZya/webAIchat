/**
 * Разметка в ответах модели.
 *
 * Безопасность: react-markdown подключён без rehype-raw, поэтому сырой HTML
 * из ответа модели не выполняется, а показывается текстом. Ответ модели —
 * недоверенные данные: в них может оказаться и разметка, и ссылка куда угодно,
 * поэтому вставлять их через innerHTML нельзя ни при каких условиях.
 *
 * Про поток: разметка разбирается на каждый новый кусок текста, и в этот
 * момент она заведомо неполная — незакрытый блок кода, оборванная таблица.
 * Это нормально: react-markdown разбирает то, что есть, и достраивает вид
 * по мере поступления остального.
 */

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './Markdown.css';

const COMPONENTS: Components = {
  // Ссылка из ответа модели ведёт на непроверенный сайт: открываем в новой
  // вкладке и закрываем ей доступ к нашей странице через window.opener.
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  // Таблицы у моделей получаются широкими: даём прокрутку внутри блока,
  // чтобы страница не разъезжалась на телефоне.
  table: ({ children }) => (
    <div className="markdown__table-scroll">
      <table>{children}</table>
    </div>
  ),
};

type Props = {
  text: string;
  /** Пока идёт поток, в конце последнего блока мигает каре. */
  isStreaming: boolean;
};

export function Markdown({ text, isStreaming }: Props) {
  return (
    <div className={isStreaming ? 'markdown markdown--streaming' : 'markdown'}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
