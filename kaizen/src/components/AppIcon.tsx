import {
  AlarmClock,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUpDown,
  Bell,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Compass,
  Copy,
  Film,
  Folder,
  Heading,
  Highlighter,
  Image,
  Indent,
  List,
  ListTodo,
  Lock,
  Menu,
  MessageSquare,
  NotebookPen,
  Outdent,
  Pause,
  Pencil,
  PieChart,
  Pin,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Scale,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Table,
  Tags,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  Wallet,
  X,
  CalendarDays,
  Car,
  CreditCard,
  Droplet,
  Eye,
  EyeOff,
  GraduationCap,
  Home,
  Info,
  Layers,
  Mountain,
  Plane,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Central registry that maps a short semantic name to a single, consistent
 * line-icon set (lucide). Everything in the app's chrome — the drawer, header,
 * tab bars and action buttons — draws its icon from here, so they all share one
 * visual language instead of the old grab-bag of emoji. (User-chosen *category*
 * emojis are intentionally left as emoji, since those are personal picks.)
 */
const ICONS = {
  // Apps / sections
  expensify: Wallet,
  questify: Compass,
  slate: NotebookPen,
  investments: TrendingUp,
  vault: Lock,
  brand: Sprout,
  // Fortuna (Financial Planning) tabs
  networth: Scale,
  cashflow: ArrowRightLeft,
  portfolio: PieChart,
  assumptions: SlidersHorizontal,
  // Header / drawer chrome
  menu: Menu,
  bell: Bell,
  close: X,
  // Expensify tabs
  add: MessageSquare,
  summary: PieChart,
  reels: Film,
  categories: Tags,
  settings: Settings,
  // Questify tabs
  goals: Target,
  calculator: Calculator,
  // Notes tab
  notes: NotebookPen,
  // Actions
  pin: Pin,
  undo: Undo2,
  redo: Redo2,
  trash: Trash2,
  folder: Folder,
  image: Image,
  highlight: Highlighter,
  bulletList: List,
  todo: ListTodo,
  outdent: Outdent,
  indent: Indent,
  table: Table,
  header: Heading,
  copy: Copy,
  plus: Plus,
  edit: Pencil,
  reorder: ArrowUpDown,
  done: Check,
  remind: AlarmClock,
  reviewed: CheckCircle2,
  recurring: RefreshCw,
  pause: Pause,
  play: Play,
  backup: ShieldCheck,
  back: ArrowLeft,
  chevronRight: ChevronRight,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  // Contextual glyphs (goals, goal types, hero cells, settings).
  calendar: CalendarDays,
  car: Car,
  liquid: Droplet,
  education: GraduationCap,
  home: Home,
  info: Info,
  mountain: Mountain,
  travel: Plane,
  family: Users,
  trenddown: TrendingDown,
  sparkle: Sparkles,
  creditcard: CreditCard,
  eye: Eye,
  eyeoff: EyeOff,
  layers: Layers,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

/**
 * Draw a named app icon. Defaults to a 20px stroke-1.75 line icon so glyphs feel
 * even across the whole UI.
 */
export default function AppIcon({ name, size = 20, className, strokeWidth = 1.75 }: Props) {
  const Cmp = ICONS[name];
  return <Cmp size={size} strokeWidth={strokeWidth} className={className} aria-hidden />;
}
