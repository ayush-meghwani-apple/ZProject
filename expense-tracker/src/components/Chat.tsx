import { useEffect, useRef, useState } from 'react';
import { parseInput } from '../core/parser';
import { formatINR } from '../core/util';
import { CategoryRepository } from '../repository/categoryRepository';
import { ExpenseRepository } from '../repository/expenseRepository';
import { SalaryCycleRepository } from '../repository/salaryCycleRepository';
import type { Category, Subcategory } from '../types/models';

export interface ChatMessage {
  id: number;
  role: 'user' | 'bot';
  text: string;
  error?: boolean;
}

let msgId = 1;
const nextId = () => msgId++;

export const initialChatMessages: ChatMessage[] = [
  {
    id: 0,
    role: 'bot',
    text: 'Hi! Add an expense, e.g. "tea 20". Type "start cycle" to begin a new period, or "help" for tips.',
  },
];

const HELP_TEXT = `Type an expense like:
• "tea 20"
• "petrol 500 card"
• "1200 groceries"

Cycles (this app tracks expenses, not income):
• "start cycle"  → begins a new cycle from now
• "salary 50000" → also starts a cycle (income optional)

Unknown words still save as a note — categorize later.`;

interface Props {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onChange: () => void;
}

export default function Chat({ messages, setMessages, onChange }: Props) {
  const [text, setText] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
    ]).then(([c, s]) => {
      setCategories(c);
      setSubcategories(s);
    });
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function pushBot(text: string, error = false) {
    setMessages((m) => [...m, { id: nextId(), role: 'bot', text, error }]);
  }

  function labelFor(
    categoryId?: string,
    subcategoryId?: string,
    cats: Category[] = categories,
    subs: Subcategory[] = subcategories,
  ): string {
    const cat = cats.find((c) => c.id === categoryId);
    const sub = subs.find((s) => s.id === subcategoryId);
    if (cat && sub) return `${cat.icon} ${cat.name} › ${sub.name}`;
    if (cat) return `${cat.icon} ${cat.name}`;
    return 'Uncategorized';
  }

  // Type "/" (or 2+ letters of a name) to get category / subcategory suggestions.
  const lastToken = text.split(' ').pop() ?? '';
  const slash = lastToken.startsWith('/');
  const query = (slash ? lastToken.slice(1) : lastToken).toLowerCase();
  const showSuggest = slash || query.length >= 2;
  const suggestions = showSuggest
    ? [
        ...categories.map((c) => ({
          key: 'c' + c.id,
          label: `${c.icon} ${c.name}`,
          value: c.name,
        })),
        ...subcategories.map((s) => ({ key: 's' + s.id, label: `↳ ${s.name}`, value: s.name })),
      ]
        .filter((o) => o.value.toLowerCase().startsWith(query))
        .slice(0, 8)
    : [];

  function applySuggestion(value: string) {
    const tokens = text.split(' ');
    tokens[tokens.length - 1] = value;
    setText(tokens.join(' ') + ' ');
    inputRef.current?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = text.trim();
    if (!raw) return;

    setMessages((m) => [...m, { id: nextId(), role: 'user', text: raw }]);
    setText('');

    // Always parse against the latest categories/aliases so a category you
    // just added is recognized without reloading the app.
    const [freshAliases, freshCats, freshSubs] = await Promise.all([
      CategoryRepository.getAliases(),
      CategoryRepository.getCategories(),
      CategoryRepository.getSubcategories(),
    ]);
    setCategories(freshCats);
    setSubcategories(freshSubs);

    const cmd = parseInput(raw, freshAliases, freshCats, freshSubs);

    if (cmd.kind === 'help') {
      pushBot(HELP_TEXT);
      return;
    }

    if (cmd.kind === 'unknown') {
      pushBot(cmd.reason, true);
      return;
    }

    if (cmd.kind === 'startCycle') {
      await SalaryCycleRepository.startCycle();
      pushBot('🔄 New cycle started from now ✅');
      onChange();
      return;
    }

    if (cmd.kind === 'salary') {
      await SalaryCycleRepository.receiveSalary(cmd.amount);
      pushBot(`💰 Income of ${formatINR(cmd.amount)} logged. New cycle started ✅`);
      onChange();
      return;
    }

    // expense
    await ExpenseRepository.addExpense({
      amount: cmd.amount,
      categoryId: cmd.categoryId,
      subcategoryId: cmd.subcategoryId,
      note: cmd.note,
      rawText: cmd.rawText,
    });
    const label = labelFor(cmd.categoryId, cmd.subcategoryId, freshCats, freshSubs);
    pushBot(`Added ${formatINR(cmd.amount)} · ${label} ✅`);
    onChange();
  }

  return (
    <div className="chat">
      <div className="chat__messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`msg ${m.role === 'user' ? 'msg--user' : 'msg--bot'} ${
              m.error ? 'error' : ''
            }`}
          >
            {m.text}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.key}
              className="suggest__chip"
              onClick={() => applySuggestion(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form className="chat__input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "tea 20"'
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="off"
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
