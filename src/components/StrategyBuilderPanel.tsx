import React, { useState } from 'react';
import { Plus, Copy, Trash2, Edit3, Check, X, RotateCcw } from 'lucide-react';
import type {
  BetTargetType,
  RouletteStrategy,
  StrategyTrigger,
  TriggerConditionType,
  TriggerSubject,
} from '../types/roulette';
import { BET_TARGET_LABELS } from '../engine/rouletteConstants';
import {
  BUILTIN_STRATEGIES,
  createCustomStrategy,
  duplicateStrategy,
} from '../engine/strategyBuilder';

interface StrategyBuilderPanelProps {
  strategies: RouletteStrategy[];
  onChangeStrategies: (next: RouletteStrategy[]) => void;
  minConfluence: number;
  onChangeMinConfluence: (val: number) => void;
}

const TRIGGER_TYPE_LABELS: Record<TriggerConditionType, string> = {
  absence_streak: 'Ausência consecutiva (≥ N giros)',
  repeat_streak: 'Repetição consecutiva (≥ N giros)',
  zero_hit: 'Saída de Zero (nos últimos N giros)',
  hot_sector: 'Setor/Alvo quente (≥ N acertos na janela)',
  cold_sector: 'Setor/Alvo frio (≤ N acertos na janela)',
  hot_number: 'Número quente repetido (≥ N vezes)',
  alternation_break: 'Alternância consecutiva (≥ N vezes)',
  dozen_gap: 'Atraso de Dúzia (≥ N giros)',
};

const TRIGGER_SUBJECT_LABELS: Record<TriggerSubject, string> = {
  any_color: 'Qualquer Cor ausente/alternada',
  any_dozen: 'Qualquer Dúzia mais atrasada',
  any_column: 'Qualquer Coluna mais atrasada',
  any_parity: 'Paridade (Par / Ímpar)',
  ...BET_TARGET_LABELS,
};

export const StrategyBuilderPanel: React.FC<StrategyBuilderPanelProps> = ({
  strategies,
  onChangeStrategies,
  minConfluence,
  onChangeMinConfluence,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<TriggerConditionType>('absence_streak');
  const [triggerSubject, setTriggerSubject] = useState<TriggerSubject>('any_color');
  const [threshold, setThreshold] = useState(5);
  const [lookbackWindow, setLookbackWindow] = useState(20);
  const [betTarget, setBetTarget] = useState<BetTargetType>('red');
  const [neighborCenter, setNeighborCenter] = useState(0);
  const [neighborRadius, setNeighborRadius] = useState(2);
  const [straightInput, setStraightInput] = useState('0, 17, 32');
  const [baseWeight, setBaseWeight] = useState(1.0);
  const [minConfidence, setMinConfidence] = useState(58);
  const [maxVolatilityPause, setMaxVolatilityPause] = useState(true);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    setTriggerType('absence_streak');
    setTriggerSubject('any_color');
    setThreshold(5);
    setLookbackWindow(20);
    setBetTarget('red');
    setNeighborCenter(0);
    setNeighborRadius(2);
    setStraightInput('0, 17, 32');
    setBaseWeight(1.0);
    setMinConfidence(58);
    setMaxVolatilityPause(true);
  };

  const openEditForm = (s: RouletteStrategy) => {
    setEditingId(s.id);
    setName(s.name);
    setDescription(s.description);
    const t0 = s.triggers[0];
    if (t0) {
      setTriggerType(t0.type);
      setTriggerSubject(t0.subject);
      setThreshold(t0.threshold);
      setLookbackWindow(t0.lookbackWindow ?? 20);
    }
    setBetTarget(s.betTarget);
    setNeighborCenter(s.neighborCenter ?? 0);
    setNeighborRadius(s.neighborRadius ?? 2);
    setStraightInput((s.straightNumbers ?? [0, 17, 32]).join(', '));
    setBaseWeight(s.baseWeight);
    setMinConfidence(s.minConfidenceToEnter);
    setMaxVolatilityPause(s.maxVolatilityPause);
    setShowForm(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const trigger: StrategyTrigger = {
      id: `trg_${Date.now()}`,
      type: triggerType,
      subject: triggerSubject,
      threshold: Math.max(1, threshold),
      lookbackWindow: Math.max(5, lookbackWindow),
    };

    const parsedStraight = straightInput
      .split(/[\s,;]+/)
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 36);

    if (editingId) {
      const updated = strategies.map((s) =>
        s.id === editingId
          ? {
              ...s,
              name: name.trim(),
              description: description.trim() || 'Estratégia personalizada de roleta europeia.',
              triggers: [trigger],
              betTarget,
              neighborCenter,
              neighborRadius,
              straightNumbers: parsedStraight.length > 0 ? parsedStraight : [0],
              baseWeight,
              minConfidenceToEnter: minConfidence,
              maxVolatilityPause,
              version: s.version + 1,
            }
          : s
      );
      onChangeStrategies(updated);
    } else {
      const created = createCustomStrategy({
        name: name.trim(),
        description: description.trim() || 'Estratégia personalizada de roleta europeia.',
        enabled: true,
        triggers: [trigger],
        triggerLogic: 'ALL',
        betTarget,
        neighborCenter,
        neighborRadius,
        straightNumbers: parsedStraight.length > 0 ? parsedStraight : [0],
        baseWeight,
        minConfidenceToEnter: minConfidence,
        maxVolatilityPause,
      });
      onChangeStrategies([created, ...strategies]);
    }

    setShowForm(false);
    resetForm();
  };

  const handleToggle = (id: string) => {
    onChangeStrategies(
      strategies.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const handleDuplicate = (s: RouletteStrategy) => {
    onChangeStrategies([duplicateStrategy(s), ...strategies]);
  };

  const handleDelete = (id: string) => {
    onChangeStrategies(strategies.filter((s) => s.id !== id));
  };

  const handleRestoreDefaults = () => {
    const customOnly = strategies.filter((s) => !s.isBuiltin);
    onChangeStrategies([...customOnly, ...BUILTIN_STRATEGIES]);
  };

  return (
    <div className="space-y-5">
      {/* Header & Global Confluence Rule */}
      <section className="bg-[#131A26] border border-[#232E42] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Criador & Gestor de Estratégias (Roleta Europeia)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Combine gatilhos objetivos e alvos físicos/de mesa. Estratégias personalizadas entram automaticamente na aprendizagem contínua e no backtesting.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-[#0E141F] border border-[#232E42] rounded-lg px-3 py-1.5">
            <span className="text-xs text-slate-300">Confluência mínima:</span>
            {[1, 2, 3].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChangeMinConfluence(c)}
                className={`px-2.5 py-1 rounded text-xs font-mono font-semibold ${
                  minConfluence === c
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#182233] text-slate-300 hover:text-white'
                }`}
              >
                {c}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="min-h-[40px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restaurar Padrões</span>
          </button>

          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
            }}
            className="min-h-[40px] px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Estratégia</span>
          </button>
        </div>
      </section>

      {/* Create / Edit Form */}
      {showForm && (
        <form
          onSubmit={handleSave}
          className="bg-[#131A26] border border-emerald-500/40 rounded-xl p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-emerald-300">
              {editingId ? 'Editar Estratégia' : 'Criar Nova Estratégia Personalizada'}
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <label className="space-y-1">
              <span className="text-slate-300 font-medium">Nome da Estratégia</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Dúzia Atrasada + Proteção Volatilidade"
                className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-300 font-medium">Descrição</span>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Regra objetiva e contexto da entrada"
                className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100"
              />
            </label>

            <label className="space-y-1">
              <span className="text-slate-300 font-medium">Tipo de Gatilho</span>
              <select
                value={triggerType}
                onChange={(e) => setTriggerType(e.target.value as TriggerConditionType)}
                className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100"
              >
                {Object.entries(TRIGGER_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-slate-300 font-medium">Elemento Observado pelo Gatilho</span>
              <select
                value={triggerSubject}
                onChange={(e) => setTriggerSubject(e.target.value as TriggerSubject)}
                className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100"
              >
                {Object.entries(TRIGGER_SUBJECT_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-slate-300 font-medium">Limiar (N giros/hits)</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                />
              </label>

              <label className="space-y-1">
                <span className="text-slate-300 font-medium">Janela (lookback)</span>
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={lookbackWindow}
                  onChange={(e) => setLookbackWindow(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                />
              </label>
            </div>

            <label className="space-y-1">
              <span className="text-slate-300 font-medium">Alvo da Aposta</span>
              <select
                value={betTarget}
                onChange={(e) => setBetTarget(e.target.value as BetTargetType)}
                className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100"
              >
                {Object.entries(BET_TARGET_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {betTarget === 'neighbors' && (
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-slate-300 font-medium">Número Central (0–36)</span>
                  <input
                    type="number"
                    min={0}
                    max={36}
                    value={neighborCenter}
                    onChange={(e) => setNeighborCenter(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-slate-300 font-medium">Raio de Vizinhos (±)</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={neighborRadius}
                    onChange={(e) => setNeighborRadius(Number(e.target.value))}
                    className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                  />
                </label>
              </div>
            )}

            {betTarget === 'straight' && (
              <label className="space-y-1 md:col-span-2">
                <span className="text-slate-300 font-medium">Fichas Diretas (0–36 separados por vírgula)</span>
                <input
                  type="text"
                  value={straightInput}
                  onChange={(e) => setStraightInput(e.target.value)}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                />
              </label>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-slate-300 font-medium">Peso Base (0.5–1.5)</span>
                <input
                  type="number"
                  step="0.05"
                  min={0.5}
                  max={1.5}
                  value={baseWeight}
                  onChange={(e) => setBaseWeight(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-300 font-medium">Confiança Mín. ENTRAR (%)</span>
                <input
                  type="number"
                  min={40}
                  max={90}
                  value={minConfidence}
                  onChange={(e) => setMinConfidence(Number(e.target.value))}
                  className="w-full min-h-[40px] px-3 rounded-lg bg-[#0E141F] border border-[#263248] text-slate-100 font-mono"
                />
              </label>
            </div>

            <label className="flex items-center gap-2.5 pt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={maxVolatilityPause}
                onChange={(e) => setMaxVolatilityPause(e.target.checked)}
                className="w-4 h-4 accent-emerald-500"
              />
              <span className="text-slate-200">
                Pausar automaticamente em clusters de alta volatilidade (2+ zeros recentes)
              </span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[#1E293B]">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="min-h-[40px] px-4 rounded-lg bg-[#1A2436] text-xs text-slate-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="min-h-[40px] px-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{editingId ? 'Salvar Alterações' : 'Criar Estratégia'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Strategy List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strategies.map((s) => (
          <div
            key={s.id}
            className={`bg-[#131A26] border rounded-xl p-4 flex flex-col justify-between gap-3 ${
              s.enabled ? 'border-[#2B3B56]' : 'border-[#1E293B] opacity-75'
            }`}
          >
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{s.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {s.isBuiltin ? 'Padrão' : 'Personalizada'} · v{s.version} · Peso aprendido{' '}
                    <span className="font-mono tabular-nums text-emerald-300">
                      {s.learnedWeight.toFixed(2)}x
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle(s.id)}
                  className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                    s.enabled
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#1A2436] text-slate-300 hover:text-white'
                  }`}
                >
                  {s.enabled ? 'Ativa' : 'Inativa'}
                </button>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{s.description}</p>

              <div className="pt-1 text-[11px] font-mono text-slate-400 space-y-0.5">
                <p>
                  Gatilho: {TRIGGER_TYPE_LABELS[s.triggers[0]?.type ?? 'absence_streak']} · Limiar{' '}
                  {s.triggers[0]?.threshold ?? 5}
                </p>
                <p>
                  Alvo: {BET_TARGET_LABELS[s.betTarget]} · Conf. mín. {s.minConfidenceToEnter}% ·
                  Volatilidade: {s.maxVolatilityPause ? 'Protegida' : 'Livre'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1E293B]">
              <button
                type="button"
                onClick={() => openEditForm(s)}
                className="min-h-[36px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200 flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Editar</span>
              </button>
              <button
                type="button"
                onClick={() => handleDuplicate(s)}
                className="min-h-[36px] px-3 rounded-lg bg-[#1A2436] hover:bg-[#233149] text-xs text-slate-200 flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Duplicar</span>
              </button>
              {!s.isBuiltin && (
                <button
                  type="button"
                  onClick={() => handleDelete(s.id)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#1A2436] hover:bg-rose-950/60 text-xs text-rose-300 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Excluir</span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
