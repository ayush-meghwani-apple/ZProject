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

Maths works too — start with "=":
• "=20+20+2*6 tea"  → adds up to ₹52

Categories:
• tap "#" to pick a category, then its subcategory
• or just type a name, e.g. "home shopping"

Cycles (this app tracks expenses, not income):
• "start cycle"  → begins a new cycle from now
• "salary 50000" → also starts a cycle (income optional)

Unknown words still save as a note — categorize later.`;

// Quick-tap keys shown above the input. "#" opens category suggestions; the
// rest are arithmetic operators understood by the calculator.
const SYMBOLS: { label: string; insert: string }[] = [
  { label: '#', insert: '#' },
  { label: '=', insert: '=' },
  { label: '+', insert: '+' },
  { label: '−', insert: '-' },
  { label: '×', insert: '*' },
  { label: '÷', insert: '/' },
  { label: '(', insert: '(' },
  { label: ')', insert: ')' },
];

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
    if (cat && sub) return `${cat.icon} ${cat.name} › ${sub.icon ? sub.icon + ' ' : ''}${sub.name}`;
    if (cat) return `${cat.icon} ${cat.name}`;
    return 'Uncategorized';
  }

  // ---- Suggestions ----------------------------------------------------------
  // "#" opens a category picker; choosing a category then reveals its
  // subcategories. Typing 2+ letters also auto-completes — and because the
  // query keeps trailing spaces, "mobile re" still finds "Mobile Recharge".
  // Suggestions are hidden once you start the note (after a comma).
  type Suggestion = { key: string; label: string } & (
    | { kind: 'pickCategory'; categoryId: string; categoryName: string }
    | { kind: 'insert'; value: string }
  );

  const subLabel = (s: Subcategory) => `↳ ${s.icon ? s.icon + ' ' : ''}${s.name}`;

  const inNote = text.includes(','); // after a comma we're writing the note
  const hashIdx = text.lastIndexOf('#');
  let segment = '';
  let inTrigger = false;
  if (!inNote && hashIdx !== -1) {
    segment = text.slice(hashIdx + 1);
    if (segment.includes('/')) {
      const subQ = segment.slice(segment.lastIndexOf('/') + 1);
      inTrigger = !subQ.includes(' ');
    } else {
      inTrigger = !segment.includes(' ');
    }
  }

  // Trailing word-phrase (allows internal spaces) used as the type-ahead query.
  const phraseMatch = text.match(/([\p{L}][\p{L} ]*)$/u);
  const phrase = phraseMatch ? phraseMatch[1] : '';
  const phraseStart = phraseMatch ? text.length - phrase.length : text.length;
  const phraseQuery = phrase.trim().toLowerCase();

  let suggestions: Suggestion[] = [];
  if (inNote) {
    suggestions = [];
  } else if (inTrigger && segment.includes('/')) {
    // Stage 2: a category is chosen — list its subcategories.
    const catName = segment.slice(0, segment.lastIndexOf('/'));
    const subQ = segment.slice(segment.lastIndexOf('/') + 1).toLowerCase();
    const cat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
    if (cat) {
      suggestions = subcategories
        .filter((s) => s.categoryId === cat.id && s.name.toLowerCase().includes(subQ))
        .slice(0, 8)
        .map((s) => ({ key: 's' + s.id, label: subLabel(s), kind: 'insert', value: `${cat.name} ${s.name}` }));
    }
  } else if (inTrigger) {
    // Stage 1: list categories.
    const q = segment.toLowerCase();
    suggestions = categories
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({
        key: 'c' + c.id,
        label: `${c.icon} ${c.name}`,
        kind: 'pickCategory',
        categoryId: c.id,
        categoryName: c.name,
      }));
  } else if (phraseQuery.length >= 2) {
    const cats: Suggestion[] = categories
      .filter((c) => c.name.toLowerCase().includes(phraseQuery))
      .map((c) => ({ key: 'c' + c.id, label: `${c.icon} ${c.name}`, kind: 'insert', value: c.name }));
    const subs: Suggestion[] = subcategories
      .filter((s) => s.name.toLowerCase().includes(phraseQuery))
      .map((s) => {
        const parent = categories.find((c) => c.id === s.categoryId);
        const pname = parent?.name ?? '';
        return {
          key: 's' + s.id,
          label: `${subLabel(s)}${pname ? ` · ${pname}` : ''}`,
          kind: 'insert',
          value: pname ? `${pname} ${s.name}` : s.name,
        };
      });
    suggestions = [...cats, ...subs].slice(0, 8);
  }

  function applySuggestion(s: Suggestion) {
    if (s.kind === 'pickCategory') {
      const hasSubs = subcategories.some((x) => x.categoryId === s.categoryId);
      if (hasSubs && hashIdx !== -1) {
        // Reveal this category's subcategories (stage 2).
        setText(text.slice(0, hashIdx) + '#' + s.categoryName + '/');
        inputRef.current?.focus();
        return;
      }
      const base = hashIdx !== -1 ? text.slice(0, hashIdx) : text;
      setText(base + s.categoryName + ' ');
      inputRef.current?.focus();
      return;
    }
    if (inTrigger && hashIdx !== -1) {
      setText(text.slice(0, hashIdx) + s.value + ' ');
    } else {
      // Replace the whole trailing phrase with the canonical name(s).
      setText(text.slice(0, phraseStart) + s.value + ' ');
    }
    inputRef.current?.focus();
  }

  function insertSymbol(sym: string) {
    const el = inputRef.current;
    if (!el) {
      setText((t) => t + sym);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + sym + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + sym.length;
      el.setSelectionRange(pos, pos);
    });
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
              onClick={() => applySuggestion(s)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="symbolbar">
        {SYMBOLS.map((s) => (
          <button
            type="button"
            key={s.label}
            className={`symbolbar__key${s.insert === '#' ? ' symbolbar__key--accent' : ''}`}
            onClick={() => insertSymbol(s.insert)}
            tabIndex={-1}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form className="chat__input" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='e.g. "tea 20" or "=20+5 tea"'
          enterKeyHint="send"
          autoComplete="off"
          autoCapitalize="off"
        />
        <button type="submit">Add</button>
      </form>
    </div>
  );
}
