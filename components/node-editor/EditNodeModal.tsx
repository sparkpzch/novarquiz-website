'use client';

import { useState, useEffect, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '@/lib/firebase/config';
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
  sessionId: string;
  onClose: () => void;
  onSave: (id: string, data: NormalNodeData | SituationNodeData) => void;
}

const CHOICE_COLORS: Record<string, string> = {
  A: '#ef4444', B: '#3b82f6', C: '#22c55e', D: '#f59e0b',
};

export function EditNodeModal({ node, sessionId, onClose, onSave }: EditNodeModalProps) {
  const [draft, setDraft] = useState<NormalNodeData | SituationNodeData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (node) setDraft(structuredClone(node.data));
  }, [node]);

  if (!node || !draft) return null;

  const handleFileUpload = (file: File) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) return;

    const mediaType = isVideo ? 'video' : 'image';
    const ext = file.name.split('.').pop();
    const path = `question-sessions/${sessionId}/${node.id}_${Date.now()}.${ext}`;
    const storageRef = ref(storage, path);

    setUploading(true);
    setUploadProgress(0);

    const task = uploadBytesResumable(storageRef, file);
    task.on(
      'state_changed',
      snap => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      () => setUploading(false),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setDraft(d => d ? { ...d, media_type: mediaType, media_url: url } : d);
        setUploading(false);
      },
    );
  };

  const handleRemoveMedia = async () => {
    const url = draft.media_url;
    setDraft(d => d ? { ...d, media_type: null, media_url: null } : d);
    if (url?.includes('firebasestorage')) {
      try { await deleteObject(ref(storage, url)); } catch { /* ignore if already deleted */ }
    }
  };

  const isNormal = node.type === 'normalNode';
  const normalDraft = draft as NormalNodeData;

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

        {/* Media upload */}
        <div>
          <label className="text-xs text-gray-400 mb-2 block">Media (Image or Video)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ''; }}
          />

          {!draft.media_url && !uploading && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-xl border-2 border-dashed border-white/15 bg-white/3 hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-colors py-6 flex flex-col items-center gap-2"
            >
              <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-gray-400">Click to upload image or video</span>
              <span className="text-xs text-gray-600">Stored in Firebase Storage</span>
            </button>
          )}

          {uploading && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300">Uploading…</span>
                <span className="text-indigo-400 font-medium">{uploadProgress}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-200 rounded-full" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {draft.media_url && !uploading && (
            <div className="space-y-2">
              {draft.media_type === 'image' ? (
                <img src={draft.media_url} alt="Preview" className="w-full h-40 object-cover rounded-xl border border-white/10" />
              ) : (
                <video src={draft.media_url} controls className="w-full rounded-xl border border-white/10 max-h-40" />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 py-2 text-sm text-gray-300 transition-colors"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleRemoveMedia}
                  className="flex-1 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 py-2 text-sm text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

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
              <label className="text-xs text-gray-400 mb-2 block">
                Answer Choices
                <span className="ml-2 text-gray-600 font-normal">
                  Points awarded when picked — negative allowed (penalty), default 0
                </span>
              </label>
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
                    <input
                      type="number"
                      step={1}
                      value={c.points}
                      onChange={e => {
                        // Empty string is treated as 0 so the input stays controlled.
                        const v = e.target.value === '' ? 0 : Math.trunc(Number(e.target.value));
                        const choices = [...normalDraft.choices];
                        choices[idx] = { ...choices[idx], points: Number.isFinite(v) ? v : 0 };
                        setDraft(d => d ? { ...d, choices } : d);
                      }}
                      title="Points awarded when this choice is picked"
                      className={`w-20 rounded-xl border px-3 py-2 text-sm text-center font-mono focus:outline-none focus:border-indigo-500 transition-colors ${
                        c.points > 0
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : c.points < 0
                            ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                            : 'border-white/10 bg-white/5 text-gray-400'
                      }`}
                    />
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
