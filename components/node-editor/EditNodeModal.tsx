'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { NormalNodeData } from './NormalNode';
import type { SituationNodeData } from './SituationNode';

type EditableNode = {
  id: string;
  type: 'normalNode' | 'situationNode';
  data: NormalNodeData | SituationNodeData;
};

interface EditNodeModalProps {
  node: EditableNode | null;
  onClose: () => void;
  onSave: (id: string, data: NormalNodeData | SituationNodeData) => void;
}

const CHOICE_COLORS: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b',
};

export function EditNodeModal({ node, onClose, onSave }: EditNodeModalProps) {
  const [draft, setDraft] = useState<NormalNodeData | SituationNodeData | null>(null);

  useEffect(() => {
    if (node) setDraft(structuredClone(node.data));
  }, [node]);

  if (!node || !draft) return null;

  const isNormal = node.type === 'normalNode';
  const normalDraft = draft as NormalNodeData;
  const situDraft = draft as SituationNodeData;

  const handleSave = () => {
    onSave(node.id, draft);
    onClose();
  };

  return (
    <Modal isOpen={!!node} onClose={onClose} title={isNormal ? 'Edit Question Node' : 'Edit Situation Node'} size="lg">
      <div className="space-y-4">
        {/* Common: text */}
        <Input
          label={isNormal ? 'Question Text' : 'Description / Title'}
          value={draft.question_text}
          onChange={e => setDraft(d => d ? { ...d, question_text: e.target.value } : d)}
          placeholder={isNormal ? 'Enter your question…' : 'Describe this scene…'}
        />

        {/* Entry point toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <div
            onClick={() => setDraft(d => d ? { ...d, is_entry_point: !d.is_entry_point } : d)}
            className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${draft.is_entry_point ? 'bg-emerald-500' : 'bg-white/10'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${draft.is_entry_point ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
          <span className="text-sm text-gray-300">Start node (entry point)</span>
        </label>

        {/* Media */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Media Type</label>
            <select
              value={draft.media_type || ''}
              onChange={e => setDraft(d => d ? { ...d, media_type: e.target.value || null, media_url: e.target.value ? d.media_url : null } : d)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">None</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </div>
          {draft.media_type ? (
            <Input
              label="Media URL"
              value={draft.media_url || ''}
              onChange={e => setDraft(d => d ? { ...d, media_url: e.target.value || null } : d)}
              placeholder="https://…"
            />
          ) : (
            <div />
          )}
        </div>

        {/* Media preview */}
        {draft.media_url && draft.media_type === 'image' && (
          <img src={draft.media_url} alt="Preview" className="w-full h-40 object-cover rounded-xl border border-white/10" />
        )}

        {/* Normal-only: choices + timer */}
        {isNormal && (
          <>
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Timer Override</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setDraft(d => {
                      if (!d) return d;
                      const nd = d as NormalNodeData;
                      return { ...d, timer_override: nd.timer_override !== null ? null : 30 };
                    })}
                    className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${normalDraft.timer_override !== null ? 'bg-indigo-500' : 'bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${normalDraft.timer_override !== null ? 'translate-x-5' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-sm text-gray-300">Custom timer</span>
                </label>
                {normalDraft.timer_override !== null && (
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={normalDraft.timer_override}
                    onChange={e => setDraft(d => d ? { ...d, timer_override: Number(e.target.value) } : d)}
                    className="w-24 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                  />
                )}
                {normalDraft.timer_override === null && (
                  <span className="text-xs text-gray-500">Using session default</span>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-2 block">Answer Choices</label>
              <div className="space-y-2">
                {normalDraft.choices?.map((c, idx) => (
                  <div key={c.label} className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: CHOICE_COLORS[c.label] }}
                    >
                      {c.label}
                    </div>
                    <input
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white text-sm placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                      placeholder={`Choice ${c.label}`}
                      value={c.choice_text}
                      onChange={e => {
                        const choices = [...normalDraft.choices];
                        choices[idx] = { ...choices[idx], choice_text: e.target.value };
                        setDraft(d => d ? { ...d, choices } : d);
                      }}
                    />
                    <button
                      onClick={() => {
                        const choices = normalDraft.choices.map((ch, i) => ({ ...ch, is_correct: i === idx }));
                        setDraft(d => d ? { ...d, choices } : d);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                        c.is_correct
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-white/5 text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      {c.is_correct ? '✓ Correct' : 'Correct?'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} className="flex-1">Save Node</Button>
        </div>
      </div>
    </Modal>
  );
}
